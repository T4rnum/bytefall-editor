import {
  MAX_FRAMES,
  addFrame,
  moveFrame,
  removeFrame,
  setFrameDuration,
} from '../../core/animation';
import { adjacentFrameTime, hasMotion } from '../../core/timeline';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { plural } from '../ui/plural';
import { notify } from './notifyStore';

const state = () => useDocumentStore.getState();

/** Любая правка кадров останавливает проигрывание, иначе текущий кадр уедет из-под операции. */
const stopPlayback = (): void => {
  const editor = useEditorStore.getState();
  if (editor.isPlaying) editor.setPlaying(false);
};

/** Новый кадр после текущего: копия или пустой с теми же слоями. Становится текущим. */
export function addFrameAction(mode: 'duplicate' | 'empty'): void {
  stopPlayback();
  const { animation, frameIndex, commitAnimation } = state();
  if (animation.frames.length >= MAX_FRAMES) {
    notify(
      `Не больше ${plural(MAX_FRAMES, { one: 'кадра', few: 'кадров', many: 'кадров' })}`,
      'error',
    );
    return;
  }
  const label = mode === 'duplicate' ? 'Duplicate frame' : 'New frame';
  commitAnimation(label, addFrame(animation, frameIndex, mode), frameIndex + 1);
}

/** Удаляет текущий кадр; указатель встаёт на соседний, а у последнего — на предыдущий. */
export function removeFrameAction(): void {
  stopPlayback();
  const { animation, frameIndex, commitAnimation } = state();
  if (animation.frames.length <= 1) return;
  const next = Math.min(frameIndex, animation.frames.length - 2);
  commitAnimation('Delete frame', removeFrame(animation, frameIndex), next);
}

/** Переставляет текущий кадр на delta позиций и следует за ним. */
export function moveFrameAction(delta: number): void {
  stopPlayback();
  const { animation, frameIndex, commitAnimation } = state();
  const to = frameIndex + delta;
  if (to < 0 || to >= animation.frames.length) return;
  const label = delta > 0 ? 'Move frame right' : 'Move frame left';
  commitAnimation(label, moveFrame(animation, frameIndex, to), to);
}

export function setFrameDurationAction(durationMs: number): void {
  stopPlayback();
  const { animation, frameIndex, commitAnimation } = state();
  if (!Number.isFinite(durationMs)) return;
  commitAnimation('Frame duration', setFrameDuration(animation, frameIndex, durationMs));
}

/** Шаг к началу соседнего кадра спрайт-трека, с переходом через край сцены. */
export function stepFrameAction(direction: 1 | -1): void {
  stopPlayback();
  const { animation, time, setTime } = state();
  setTime(adjacentFrameTime(animation, time, direction));
}

export function togglePlaybackAction(): void {
  const editor = useEditorStore.getState();
  const { animation } = state();
  if (!editor.isPlaying && animation.frames.length < 2 && !hasMotion(animation)) {
    notify('Чтобы проиграть анимацию, добавьте второй кадр или ключи');
    return;
  }
  editor.setPlaying(!editor.isPlaying);
}
