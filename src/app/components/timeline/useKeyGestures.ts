import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import { roundTime } from '../../../core/time';
import type { KeyRef, Track } from '../../../core/tracks';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { moveKeysAction } from '../../store/keyActions';
import { type SnapTargets, snapTime } from '../../timeline/timelineMath';
import { snapTargets } from './snapTargets';

type Gesture =
  | {
      readonly kind: 'keys';
      readonly startX: number;
      /** Ключ под указателем: к целям привязки тянется именно он. */
      readonly anchor: KeyRef;
      readonly original: readonly Track[];
      readonly refs: readonly KeyRef[];
      readonly targets: SnapTargets;
      readonly mergeKey: string;
      moved: boolean;
    }
  | {
      readonly kind: 'box';
      readonly startX: number;
      readonly startY: number;
      readonly additive: readonly KeyRef[];
      moved: boolean;
    };

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Меньше этого жест считается щелчком, а не перетаскиванием. */
const DRAG_PX = 3;

const sameRef = (a: KeyRef, b: KeyRef): boolean => a.track === b.track && a.time === b.time;

function refOf(target: EventTarget): KeyRef | null {
  const el = target instanceof Element ? target.closest<HTMLElement>('.tl-key') : null;
  if (!el?.dataset.track || el.dataset.time === undefined) return null;
  return { track: el.dataset.track, time: Number(el.dataset.time) };
}

function capture(event: ReactPointerEvent<HTMLElement>): void {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Синтетические события без активного указателя: захват необязателен.
  }
}

/** Ключи, чьи ромбы попали в рамку, — по тому, где они на экране. */
function keysInBox(root: HTMLElement, left: number, top: number, right: number, bottom: number) {
  const found: KeyRef[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('.tl-key')) {
    const r = el.getBoundingClientRect();
    if (r.right < left || r.left > right || r.bottom < top || r.top > bottom) continue;
    const ref = refOf(el);
    if (ref) found.push(ref);
  }
  return found;
}

/**
 * Жесты над ключами. Щелчок выделяет ключ, с Shift — добавляет или снимает. Протяжка ключа
 * двигает все выделенные: они липнут к началам кадров, ключам, указателю и тактам, с Alt —
 * свободно. Протяжка по пустому месту выделяет рамкой, щелчок по нему снимает выделение.
 */
export function useKeyGestures(scale: number, span: number) {
  const gesture = useRef<Gesture | null>(null);
  const series = useRef(0);
  const [box, setBox] = useState<Box | null>(null);

  const startKeys = (event: ReactPointerEvent<HTMLElement>, ref: KeyRef): void => {
    const editor = useEditorStore.getState();
    if (editor.isPlaying) editor.setPlaying(false);
    const selected = editor.selectedKeys.some((r) => sameRef(r, ref));
    if (event.shiftKey && selected) {
      editor.setSelectedKeys(editor.selectedKeys.filter((r) => !sameRef(r, ref)));
      return;
    }
    const refs = event.shiftKey
      ? [...editor.selectedKeys, ref]
      : selected
        ? editor.selectedKeys
        : [ref];
    editor.setSelectedKeys(refs);
    const { animation, time } = useDocumentStore.getState();
    const targets = snapTargets(animation, animation.tracks, scale, span, {
      playhead: time,
      moving: refs,
    });
    series.current += 1;
    gesture.current = {
      kind: 'keys',
      startX: event.clientX,
      anchor: ref,
      original: animation.tracks,
      refs,
      targets,
      mergeKey: `keys:${series.current}`,
      moved: false,
    };
  };

  const moveKeys = (g: Extract<Gesture, { kind: 'keys' }>, event: ReactPointerEvent): void => {
    if (!g.moved && Math.abs(event.clientX - g.startX) < DRAG_PX) return;
    g.moved = true;
    const raw = Math.max(0, g.anchor.time + (event.clientX - g.startX) / scale);
    const time = event.altKey ? roundTime(raw) : snapTime(raw, g.targets);
    moveKeysAction(g.original, g.refs, time - g.anchor.time, g.mergeKey);
  };

  const moveBox = (
    g: Extract<Gesture, { kind: 'box' }>,
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (!g.moved && Math.abs(dx) < DRAG_PX && Math.abs(dy) < DRAG_PX) return;
    g.moved = true;
    const [left, right] = [Math.min(g.startX, event.clientX), Math.max(g.startX, event.clientX)];
    const [top, bottom] = [Math.min(g.startY, event.clientY), Math.max(g.startY, event.clientY)];
    const root = event.currentTarget;
    const found = keysInBox(root, left, top, right, bottom);
    const all = [...g.additive, ...found.filter((f) => !g.additive.some((a) => sameRef(a, f)))];
    useEditorStore.getState().setSelectedKeys(all);
    const rect = root.getBoundingClientRect();
    setBox({ x: left - rect.left, y: top - rect.top, w: right - left, h: bottom - top });
  };

  return {
    box,
    onPointerDown: (event: ReactPointerEvent<HTMLElement>): void => {
      if (event.button !== 0) return;
      const target = event.target as Element;
      const ref = refOf(target);
      if (ref) startKeys(event, ref);
      else if (target.closest('.tl-lane--track')) {
        const additive = event.shiftKey ? useEditorStore.getState().selectedKeys : [];
        gesture.current = {
          kind: 'box',
          startX: event.clientX,
          startY: event.clientY,
          additive,
          moved: false,
        };
      } else return;
      if (gesture.current) capture(event);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>): void => {
      const g = gesture.current;
      if (g?.kind === 'keys') moveKeys(g, event);
      else if (g?.kind === 'box') moveBox(g, event);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>): void => {
      const g = gesture.current;
      gesture.current = null;
      setBox(null);
      if (!g || g.moved) return;
      const editor = useEditorStore.getState();
      // Щелчок по одному из нескольких выделенных ключей оставляет выделенным только его.
      if (g.kind === 'keys' && !event.shiftKey) editor.setSelectedKeys([g.anchor]);
      if (g.kind === 'box' && !event.shiftKey) editor.setSelectedKeys([]);
    },
  };
}
