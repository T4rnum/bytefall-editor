import type { Animation } from '../../core/animation';
import { segmentHandles } from '../../core/curves';
import type { Document } from '../../core/document';
import {
  CHANNELS,
  type KeyRef,
  type Track,
  type ValueKind,
  trackKey,
  valueKind,
} from '../../core/tracks';
import { labelOf, nodeLabel } from '../timeline/timelineRows';
import type { CurveBounds } from './curveView';

/**
 * Канал кривой: одно число трека. У положения два канала, у оттенка четыре, у поворота один.
 * Цвет — как у осей в Blender: X красный, Y зелёный, Z синий; одиночные числа — по кругу.
 */
export interface CurveChannel {
  /** `трек#канал`: по нему прячут и узнают канал. */
  readonly id: string;
  readonly track: Track;
  readonly channel: number;
  /** Чьё свойство и какое: «Мяч», «Положение X». */
  readonly owner: string;
  readonly label: string;
  /** CSS-переменная цвета кривой. */
  readonly color: string;
}

const CHANNEL_NAMES: Readonly<Record<ValueKind, readonly string[]>> = {
  scalar: [''],
  vec2: ['X', 'Y'],
  vec3: ['X', 'Y', 'Z'],
  color: ['R', 'G', 'B', 'A'],
};

const AXIS_COLORS = ['--curve-x', '--curve-y', '--curve-z', '--curve-w'];
const SCALAR_COLORS = ['--curve-s1', '--curve-s2', '--curve-s3', '--curve-s4'];

export const channelId = (track: Track, channel: number): string => `${trackKey(track)}#${channel}`;

/**
 * Какие треки показывать. Как «только выбранное» в Blender: треки выбранных объектов и узлов их
 * графов, плюс треки выделенных ключей. Ничего не выбрано — все треки, чтобы редактор не был
 * пустым; `all` — все треки всегда.
 */
export function curveTracks(
  anim: Animation,
  doc: Document,
  objectIds: readonly string[],
  selectedKeys: readonly KeyRef[],
  all: boolean,
): readonly Track[] {
  if (all || (objectIds.length === 0 && selectedKeys.length === 0)) return anim.tracks;
  const objects = new Set(objectIds);
  const nodes = new Set(
    doc.objects
      .filter((o) => objects.has(o.id))
      .flatMap((o) => o.graph?.nodes ?? [])
      .map((n) => n.id),
  );
  const keyed = new Set(selectedKeys.map((r) => r.track));
  return anim.tracks.filter(
    (t) =>
      (t.node === 'object' && objects.has(t.id)) ||
      (t.node === 'node' && nodes.has(t.id)) ||
      keyed.has(trackKey(t)),
  );
}

/** Каналы треков по порядку треков. */
export function curveChannels(
  anim: Animation,
  doc: Document,
  tracks: readonly Track[],
): CurveChannel[] {
  const out: CurveChannel[] = [];
  let scalars = 0;
  for (const track of tracks) {
    const kind = valueKind(track);
    const owner = nodeLabel(anim, doc, track);
    const property = labelOf(track, doc);
    const names = CHANNEL_NAMES[kind];
    for (let channel = 0; channel < CHANNELS[kind]; channel++) {
      const color =
        kind === 'scalar' ? SCALAR_COLORS[scalars++ % SCALAR_COLORS.length] : AXIS_COLORS[channel];
      out.push({
        id: channelId(track, channel),
        track,
        channel,
        owner,
        label: names[channel] ? `${property} ${names[channel]}` : property,
        color: `var(${color})`,
      });
    }
  }
  return out;
}

/**
 * Как канал ложится на ось значений: число `v` рисуется в `(v − center) / half`. Без нормировки
 * — как есть; с нормировкой, как Normalize в Blender, каждая кривая в своём размахе −1…1, и
 * поворот в сотни градусов не сплющивает положение в десятки ячеек.
 */
export interface ChannelScale {
  readonly center: number;
  readonly half: number;
}

export const NO_SCALE: ChannelScale = { center: 0, half: 1 };

export const toAxis = (s: ChannelScale, v: number): number => (v - s.center) / s.half;
export const fromAxis = (s: ChannelScale, a: number): number => a * s.half + s.center;

/** Нормировка канала по его ключам и ручкам; плоский канал ложится на ноль. */
export function channelScale(channel: CurveChannel): ChannelScale {
  const b = curveBounds([channel]);
  if (!b) return NO_SCALE;
  const half = (b.v1 - b.v0) / 2;
  return half > 1e-9 ? { center: (b.v0 + b.v1) / 2, half } : { center: b.v0, half: 1 };
}

/**
 * Что вписывать в окно: моменты ключей и значения ключей и ручек видимых каналов, на оси
 * значений — через `scaleOf`. Ручки входят, потому что перелёт кривой уходит за значения ключей.
 */
export function curveBounds(
  channels: readonly CurveChannel[],
  scaleOf: (channel: CurveChannel) => ChannelScale = () => NO_SCALE,
): CurveBounds | null {
  let t0 = Infinity;
  let t1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  const add = (t: number, v: number): void => {
    t0 = Math.min(t0, t);
    t1 = Math.max(t1, t);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  };
  for (const c of channels) {
    const { track, channel } = c;
    const scale = scaleOf(c);
    const put = (t: number, v: number): void => add(t, toAxis(scale, v));
    track.keys.forEach((key, i) => {
      put(key.time, key.value[channel]);
      const next = track.keys[i + 1];
      const handles = next && segmentHandles(key, next, channel);
      if (handles) {
        put(handles.out.x, handles.out.y);
        put(handles.in.x, handles.in.y);
      }
    });
  }
  return t0 <= t1 ? { t0, t1, v0, v1 } : null;
}
