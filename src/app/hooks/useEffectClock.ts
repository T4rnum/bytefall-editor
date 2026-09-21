import { useEffect } from 'react';
import { hasActiveEffects } from '../../core/effects';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';

/** Эффекты пересобирают кадр целиком, поэтому часы ограничены 30 тиками в секунду. */
const MIN_TICK_MS = 1000 / 30;

/** Часы эффектов: идут по requestAnimationFrame, пока эффекты включены и хоть один есть в документе. */
export function useEffectClock(): void {
  const live = useEditorStore((s) => s.effectsLive);
  const hasEffects = useDocumentStore((s) =>
    s.animation.frames.some((frame) =>
      frame.layers.some((layer) => hasActiveEffects(layer.effects)),
    ),
  );

  useEffect(() => {
    if (!live || !hasEffects) return;
    const origin = performance.now() - useEditorStore.getState().effectTime;
    let last = -Infinity;
    let frame = 0;
    const tick = (now: number): void => {
      if (now - last >= MIN_TICK_MS) {
        last = now;
        useEditorStore.getState().setEffectTime(now - origin);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [live, hasEffects]);
}
