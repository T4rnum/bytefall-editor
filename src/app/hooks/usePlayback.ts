import { useEffect } from 'react';
import { sampleTimeAt, sceneDuration } from '../../core/timeline';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';

/**
 * Проигрывание: время сцены идёт по часам и зацикливается на её длине. На экран попадают те же
 * моменты, что и в экспорт (`sampleTimeAt`): без движения — начала кадров, с движением — такты
 * частоты сцены. Поэтому проигрывание показывает ровно то, что окажется в GIF.
 */
export function usePlayback(): void {
  const isPlaying = useEditorStore((s) => s.isPlaying);

  useEffect(() => {
    if (!isPlaying) return;
    const { animation, time } = useDocumentStore.getState();
    // Со стоящего за концом сцены указателя проигрывание начинается сначала.
    const origin = performance.now() - (time < sceneDuration(animation) ? time : 0);
    let frame = 0;
    const tick = (now: number): void => {
      const state = useDocumentStore.getState();
      const length = sceneDuration(state.animation);
      const elapsed = (now - origin) % length;
      state.setTime(sampleTimeAt(state.animation, elapsed));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);
}
