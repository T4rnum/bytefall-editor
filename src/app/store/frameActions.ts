import {
  MAX_FRAMES,
  addFrame,
  moveFrame,
  removeFrame,
  setFrameDuration,
} from '../../core/animation';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
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
    notify(`At most ${MAX_FRAMES} frames`, 'error');
    return;
  }
  const label = mode === 'duplicate' ? 'Duplicate frame' : 'New frame';
  commitAnimation(label, addFrame(animation, frameIndex, mode), frameIndex + 1);
}

export function removeFrameAction(): void {
  stopPlayback();
  const { animation, frameIndex, commitAnimation } = state();
  if (animation.frames.length <= 1) return;
  commitAnimation('Delete frame', removeFrame(animation, frameIndex));
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

/** Шаг по кадрам с переходом через край. */
export function stepFrameAction(delta: number): void {
  stopPlayback();
  const { animation, frameIndex, setFrameIndex } = state();
  const count = animation.frames.length;
  setFrameIndex((((frameIndex + delta) % count) + count) % count);
}

export function togglePlaybackAction(): void {
  const editor = useEditorStore.getState();
  if (!editor.isPlaying && state().animation.frames.length < 2) {
    notify('Add a second frame to play the animation');
    return;
  }
  editor.setPlaying(!editor.isPlaying);
}
