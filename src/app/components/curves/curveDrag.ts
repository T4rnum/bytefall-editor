import type { Point } from '../../../core/geometry';
import { easingWithHandle } from '../../../core/curves';
import { roundTime } from '../../../core/time';
import { sceneDuration } from '../../../core/timeline';
import { type KeyRef, type Track, findTrack, targetOf, trackKey } from '../../../core/tracks';
import { type ChannelScale, type CurveChannel, fromAxis } from '../../curves/curveChannels';
import { type HandlePoint, type KeyPoint, nearest } from '../../curves/curveGeometry';
import { type CurveView, type Size, timeScale } from '../../curves/curveView';
import { dragCurveKeysAction, setCurveHandleAction } from '../../store/curveActions';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { type SnapTargets, snapTime } from '../../timeline/timelineMath';
import { snapTargets } from '../timeline/snapTargets';

/**
 * Жесты редактора кривых без React: с чего жест начинается и что делает на каждом шаге. Хук
 * `useCurveGestures` только разбирает события указателя и зовёт отсюда.
 */
/** Полоса времени над полем: по ней водят указатель времени. */
export const RULER = 20;
/** Радиус захвата ключа и ручки, в пикселях. */
const REACH = 7;
/** Меньше этого жест — щелчок. */
export const DRAG_PX = 3;
export type Gesture =
  | { readonly kind: 'pan'; lastX: number; lastY: number }
  | { readonly kind: 'scrub'; readonly targets: SnapTargets }
  | {
      readonly kind: 'keys';
      /** Нормировка канала в начале жеста: мышь переводится в значение по ней. */
      readonly scale: ChannelScale;
      readonly start: Point;
      readonly key: KeyPoint;
      readonly original: readonly Track[];
      readonly refs: readonly KeyRef[];
      readonly targets: SnapTargets;
      readonly mergeKey: string;
      moved: boolean;
    }
  | {
      readonly kind: 'handle';
      readonly scale: ChannelScale;
      readonly handle: HandlePoint;
      readonly original: readonly Track[];
      readonly mergeKey: string;
    }
  | {
      readonly kind: 'box';
      readonly start: Point;
      readonly additive: readonly KeyRef[];
      moved: boolean;
    };

export interface CurveFrame {
  readonly view: CurveView;
  /** Поле под полосой времени. */
  readonly plot: Size;
  readonly channels: readonly CurveChannel[];
  readonly keys: readonly KeyPoint[];
  readonly handles: readonly HandlePoint[];
  /** Как канал ложится на ось значений: с нормировкой — в −1…1. */
  readonly scaleOf: (channel: CurveChannel) => ChannelScale;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const sameRef = (a: KeyRef, b: KeyRef): boolean => a.track === b.track && a.time === b.time;

/** Момент и значение под точкой редактора, с учётом полосы времени сверху. */
export function unmap(frame: CurveFrame, p: Point): Point {
  const { view, plot } = frame;
  return {
    x: view.t0 + (p.x / plot.width) * (view.t1 - view.t0),
    y: view.v1 - ((p.y - RULER) / plot.height) * (view.v1 - view.v0),
  };
}

function targetsFor(frame: CurveFrame, moving: readonly KeyRef[]): SnapTargets {
  const { animation, time } = useDocumentStore.getState();
  const span = Math.max(frame.view.t1, sceneDuration(animation));
  const scale = timeScale(frame.view, frame.plot);
  return snapTargets(animation, animation.tracks, scale, span, { playhead: time, moving });
}

let series = 0;

/** Выделение по щелчку на ключе, как в таймлайне; null — щелчок с Shift снял ключ. */
function pickKey(ref: KeyRef, shift: boolean): readonly KeyRef[] | null {
  const editor = useEditorStore.getState();
  const selected = editor.selectedKeys.some((r) => sameRef(r, ref));
  if (shift && selected) {
    editor.setSelectedKeys(editor.selectedKeys.filter((r) => !sameRef(r, ref)));
    return null;
  }
  const refs = shift ? [...editor.selectedKeys, ref] : selected ? editor.selectedKeys : [ref];
  editor.setSelectedKeys(refs);
  return refs;
}

/** С чего начинается жест левой кнопкой: ручка, ключ, полоса времени или рамка. */
export function startGesture(frame: CurveFrame, at: Point, shift: boolean): Gesture | null {
  const editor = useEditorStore.getState();
  if (editor.isPlaying) editor.setPlaying(false);
  const { animation } = useDocumentStore.getState();
  if (at.y < RULER) return { kind: 'scrub', targets: targetsFor(frame, []) };
  series += 1;
  const mergeKey = `curves:${series}`;
  const handle = nearest(frame.handles, at.x, at.y, REACH);
  if (handle) {
    const scale = frame.scaleOf(handle.channel);
    return { kind: 'handle', handle, scale, original: animation.tracks, mergeKey };
  }
  const key = nearest(frame.keys, at.x, at.y, REACH);
  if (key) {
    const refs = pickKey(key.ref, shift);
    if (!refs) return null;
    const targets = targetsFor(frame, refs);
    const original = animation.tracks;
    const scale = frame.scaleOf(key.channel);
    return { kind: 'keys', scale, start: at, key, original, refs, targets, mergeKey, moved: false };
  }
  return { kind: 'box', start: at, additive: shift ? editor.selectedKeys : [], moved: false };
}

/**
 * Ключи тянут по времени и по значению сразу; с Shift — только вдоль той оси, куда ушли дальше.
 * По времени они липнут к кадрам, ключам и указателю, с Alt — свободно.
 */
export function moveKeys(frame: CurveFrame, g: Extract<Gesture, { kind: 'keys' }>, e: PointerLike) {
  const dx = e.x - g.start.x;
  const dy = e.y - g.start.y;
  if (!g.moved && Math.hypot(dx, dy) < DRAG_PX) return;
  g.moved = true;
  const lockTime = e.shiftKey && Math.abs(dy) > Math.abs(dx);
  const lockValue = e.shiftKey && !lockTime;
  const { view, plot } = frame;
  const raw = Math.max(
    0,
    g.key.ref.time + (lockTime ? 0 : (dx / plot.width) * (view.t1 - view.t0)),
  );
  const time = e.altKey || lockTime ? roundTime(raw) : snapTime(raw, g.targets);
  const dv = lockValue ? 0 : (-dy / plot.height) * (view.v1 - view.v0) * g.scale.half;
  const grab = { target: targetOf(g.key.channel.track), channel: g.key.channel.channel };
  dragCurveKeysAction(g.original, g.refs, time - g.key.ref.time, grab, dv, g.mergeKey);
}

/** Ручку тянут: кривая перехода считается от ключей в начале жеста. */
export function moveHandle(frame: CurveFrame, g: Extract<Gesture, { kind: 'handle' }>, at: Point) {
  const { channel, time, side } = g.handle;
  const track = findTrack(g.original, channel.track);
  const index = track?.keys.findIndex((k) => k.time === time) ?? -1;
  if (!track || index < 0 || index + 1 >= track.keys.length) return;
  const easing = easingWithHandle(track.keys[index], track.keys[index + 1], channel.channel, side, {
    x: unmap(frame, at).x,
    y: fromAxis(g.scale, unmap(frame, at).y),
  });
  setCurveHandleAction(g.original, targetOf(track), time, easing, g.mergeKey);
}

export interface PointerLike extends Point {
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** Все ключи видимых каналов — для Ctrl+A. */
export function allKeyRefs(channels: readonly CurveChannel[]): KeyRef[] {
  const seen = new Map<string, KeyRef>();
  for (const { track } of channels) {
    const key = trackKey(track);
    for (const k of track.keys) seen.set(`${key}@${k.time}`, { track: key, time: k.time });
  }
  return [...seen.values()];
}
