import { MAX_SCENE_DURATION, MIN_SCENE_DURATION, clampFps, roundTime } from '../../core/time';
import { keyTimes } from '../../core/tracks';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';

const docState = () => useDocumentStore.getState();

/** Указатель времени рукой: таймлайн и линейка. Проигрывание при этом останавливается. */
export function scrubAction(time: number): void {
  const editor = useEditorStore.getState();
  if (editor.isPlaying) editor.setPlaying(false);
  docState().setTime(time);
}

export function goToStartAction(): void {
  scrubAction(0);
}

/** К ближайшему ключу в сторону `direction`. Дальше ключей нет — указатель стоит. */
export function stepKeyAction(direction: 1 | -1): void {
  const { animation, time } = docState();
  const times = keyTimes(animation.tracks);
  const next = direction > 0 ? times.find((t) => t > time) : times.filter((t) => t < time).pop();
  if (next !== undefined) scrubAction(next);
}

export function setFpsAction(fps: number): void {
  const { animation, commitAnimation } = docState();
  const next = clampFps(fps);
  if (next !== animation.fps) commitAnimation('Scene fps', { ...animation, fps: next });
}

/**
 * Длина сцены в миллисекундах; null — снова по кадрам и ключам. `mergeKey` склеивает записи
 * одного перетаскивания поля.
 */
export function setSceneDurationAction(duration: number | null, mergeKey?: string): void {
  const { animation, commitAnimation } = docState();
  const next =
    duration === null
      ? null
      : roundTime(Math.min(MAX_SCENE_DURATION, Math.max(MIN_SCENE_DURATION, duration)));
  if (next === animation.duration || (next !== null && !Number.isFinite(next))) return;
  commitAnimation('Scene length', { ...animation, duration: next }, undefined, mergeKey);
}
