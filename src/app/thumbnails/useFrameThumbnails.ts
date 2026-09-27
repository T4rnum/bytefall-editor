import { useEffect, useState, useSyncExternalStore } from 'react';
import { useDocumentStore } from '../store/documentStore';
import { useFontStore } from '../store/fontStore';
import { ThumbnailCache } from './thumbnailCache';

/** Плотность символа — у атласа нынешнего шрифта: кэш живёт дольше, чем шрифт документа. */
const coverage = (glyph: string): number => useFontStore.getState().atlas?.coverage(glyph) ?? 0.5;

/**
 * Кэш миниатюр, который следит за документом. Перерисовка компонента происходит, только когда
 * какая-то миниатюра действительно пересчиталась, а не на каждую правку документа.
 */
export function useFrameThumbnails(): ThumbnailCache {
  const [cache] = useState(
    () => new ThumbnailCache(coverage, () => globalThis.devicePixelRatio || 1),
  );

  useEffect(() => {
    const state = useDocumentStore.getState();
    cache.sync(state.animation, state.frameIndex);
    const unsubscribe = useDocumentStore.subscribe((next, prev) => {
      if (next.animation !== prev.animation || next.frameIndex !== prev.frameIndex) {
        cache.sync(next.animation, next.frameIndex);
      }
    });
    return () => {
      unsubscribe();
      cache.stop();
    };
  }, [cache]);

  useSyncExternalStore(cache.subscribe, cache.getVersion);
  return cache;
}
