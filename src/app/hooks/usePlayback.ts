import { useEffect } from 'react';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';

/** Проигрывание: пока включено, кадры сменяются по своей длительности и зацикливаются. */
export function usePlayback(): void {
  const isPlaying = useEditorStore((s) => s.isPlaying);

  useEffect(() => {
    if (!isPlaying) return;
    let timer = 0;
    const schedule = (): void => {
      const { animation, frameIndex } = useDocumentStore.getState();
      const current = animation.frames[frameIndex] ?? animation.frames[0];
      timer = window.setTimeout(() => {
        const state = useDocumentStore.getState();
        state.setFrameIndex((state.frameIndex + 1) % state.animation.frames.length);
        schedule();
      }, current.duration);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [isPlaying]);
}
