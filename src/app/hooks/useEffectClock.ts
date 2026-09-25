import { useEffect } from 'react';
import { isDeformed } from '../../core/deformObject';
import { hasActiveEffects } from '../../core/effects';
import { isAnimatedMaterial } from '../../core/material';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';

/** Эффекты пересобирают кадр целиком, поэтому часы ограничены 30 тиками в секунду. */
const MIN_TICK_MS = 1000 / 30;

/**
 * Часы живых эффектов на паузе: идут по requestAnimationFrame, пока живые эффекты включены,
 * сцена стоит и хоть один эффект есть в документе. При проигрывании эффекты идут по времени
 * сцены, как в экспорте, и эти часы не нужны.
 */
export function useEffectClock(): void {
  const live = useEditorStore((s) => s.effectsLive && !s.isPlaying);
  const hasEffects = useDocumentStore((s) =>
    s.animation.frames.some(
      (frame) =>
        frame.layers.some((layer) => hasActiveEffects(layer.effects)) ||
        frame.objects.some((o) => isDeformed(o) || isAnimatedMaterial(o.material)),
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
