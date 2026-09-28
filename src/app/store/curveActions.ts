import { offsetKeyChannel, setSegmentEasing } from '../../core/curves';
import type { Easing } from '../../core/easing';
import { type KeyRef, type Track, type TrackTarget, moveKeys, trackKey } from '../../core/tracks';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';

/** Что умеет открытый редактор кривых по команде извне: из реестра клавиш и кнопок панели. */
export interface CurveEditorHandle {
  /** Вписать видимые кривые в окно. */
  fit(): void;
  /** Выделить все ключи видимых кривых. */
  selectAll(): void;
}

let active: CurveEditorHandle | null = null;

/** Редактор кривых регистрирует себя, пока открыт, как редактор узлов. */
export function setActiveCurveEditor(handle: CurveEditorHandle | null): void {
  active = handle;
}

export const activeCurveEditor = (): CurveEditorHandle | null => active;

/** Клавиши редактора кривых действуют, пока фокус в нём: Home там вписывает кривые. */
export const curveEditorFocused = (): boolean =>
  active !== null && document.activeElement?.closest('.curve-editor') != null;

/** Канал, за который взялись: по значению правится только он. */
export interface CurveGrab {
  readonly target: TrackTarget;
  readonly channel: number;
}

/**
 * Протяжка ключей в редакторе кривых (`docs/DESIGN.md`, раздел 4.2). По времени едут все
 * выделенные ключи, по значению — канал `grab` у выделенных ключей его трека. Считается всякий
 * раз от треков в начале жеста, одной записью истории на жест.
 */
export function dragCurveKeysAction(
  original: readonly Track[],
  refs: readonly KeyRef[],
  dt: number,
  grab: CurveGrab | null,
  dv: number,
  mergeKey: string,
): void {
  let tracks = original;
  if (grab && dv !== 0) {
    const own = trackKey(grab.target);
    const times = refs.filter((r) => r.track === own).map((r) => r.time);
    tracks = offsetKeyChannel(tracks, grab.target, times, grab.channel, dv);
  }
  const moved = moveKeys(tracks, refs, dt);
  const { animation, commitAnimation } = useDocumentStore.getState();
  commitAnimation('Move keys', { ...animation, tracks: moved.tracks }, undefined, mergeKey);
  useEditorStore.getState().setSelectedKeys(moved.refs);
}

/** Ручка перехода: кривая ключа `time` трека `target`, одной записью на жест. */
export function setCurveHandleAction(
  original: readonly Track[],
  target: TrackTarget,
  time: number,
  easing: Easing,
  mergeKey: string,
): void {
  const { animation, commitAnimation } = useDocumentStore.getState();
  const tracks = setSegmentEasing(original, target, time, easing);
  commitAnimation('Key curve', { ...animation, tracks }, undefined, mergeKey);
}
