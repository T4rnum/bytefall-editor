import { useEffect, useState, useSyncExternalStore } from 'react';
import type { GlyphAtlas } from '../../render/font/GlyphAtlas';
import { useDocumentStore } from '../store/documentStore';
import { ThumbnailCache } from './thumbnailCache';

/**
 * Кэш миниатюр, который следит за документом. Перерисовка компонента происходит, только когда
 * какая-то миниатюра действительно пересчиталась, а не на каждую правку документа.
 */
export function useFrameThumbnails(atlas: GlyphAtlas): ThumbnailCache {
  const [cache] = useState(
    () =>
      new ThumbnailCache(
        (glyph) => atlas.coverage(glyph),
        () => globalThis.devicePixelRatio || 1,
      ),
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
