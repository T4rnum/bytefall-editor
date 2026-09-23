import { describe, expect, it } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { createDocument, updateLayer } from '../../../core/document';
import { createEffect } from '../../../core/effects';
import { GIF_MAX_FPS, gifSamples, gifTimings } from '../animationExport';

/** Сцена с огнём: движение есть, кадры идут тактами частоты. */
function burning(fps: number) {
  const doc = createDocument({ width: 4, height: 2 });
  const lit = updateLayer(doc, doc.layers[0].id, { effects: [createEffect('fire')] });
  return { ...createAnimation(lit), fps, duration: 200 };
}

describe('моменты GIF', () => {
  it('задержки кратны сотой, начало каждого кадра округляется, а не задержка', () => {
    const samples = [0, 41.667, 83.333, 125, 166.667].map((time) => ({ time, delay: 0 }));
    expect(gifTimings(samples, 208.333).map((m) => m.delay)).toEqual([40, 40, 50, 40, 40]);
  });

  it('кадр короче двух сотых отдаёт время соседу', () => {
    const samples = [0, 10, 30].map((time) => ({ time, delay: 0 }));
    expect(gifTimings(samples, 50)).toEqual([
      { time: 0, delay: 30 },
      { time: 30, delay: 20 },
    ]);
  });

  it('60 к/с в GIF — ровные 50: задержка короче двух сотых браузерам недоступна', () => {
    expect(GIF_MAX_FPS).toBe(50);
    const fast = gifTimings(gifSamples(burning(60)), 200);
    expect(fast.map((m) => m.delay)).toEqual(Array.from({ length: 10 }, () => 20));
    const slow = gifSamples(burning(20));
    expect(slow.map((s) => s.time)).toEqual([0, 50, 100, 150]);
  });
});
