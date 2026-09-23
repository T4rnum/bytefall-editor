import { describe, expect, it } from 'vitest';
import { type Animation, createAnimation, createFrame, setFrameDuration } from '../animation';
import { createDocument, updateLayer } from '../document';
import { createEffect } from '../effects';
import {
  MIN_MOTION_DURATION,
  adjacentFrameTime,
  exportSamples,
  frameIndexAt,
  frameStart,
  hasMotion,
  sampleTimeAt,
  sceneDuration,
  spriteBoundaries,
  tickAt,
} from '../timeline';
import { setKey } from '../tracks';

/** Три кадра: 100, 200 и 300 мс. Кадр начинается в 0, 100 и 300, круг — 600 мс. */
function threeFrames(): Animation {
  const doc = createDocument({ width: 4, height: 2 });
  const base = createAnimation(doc);
  const frames = [100, 200, 300].map((d) => createFrame(doc.layers, [], d));
  return { ...base, frames };
}

const withMotion = (anim: Animation): Animation => {
  let tracks = setKey(
    anim.tracks,
    { node: 'layer', id: anim.frames[0].layers[0].id, property: 'opacity' },
    0,
    [1],
  );
  tracks = setKey(
    tracks,
    { node: 'layer', id: anim.frames[0].layers[0].id, property: 'opacity' },
    500,
    [0],
  );
  return { ...anim, tracks };
};

describe('спрайт-трек', () => {
  it('в момент t показан кадр, чьё время идёт, и кадры идут по кругу', () => {
    const anim = threeFrames();
    expect([0, 99, 100, 299, 300, 599].map((t) => frameIndexAt(anim, t))).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
    expect([600, 700, 1300, 1250].map((t) => frameIndexAt(anim, t))).toEqual([0, 1, 1, 0]);
    expect(frameIndexAt(anim, -50)).toBe(0);
    expect([0, 1, 2, 7].map((i) => frameStart(anim, i))).toEqual([0, 100, 300, 300]);
  });

  it('начала показов кадров идут кругами до конца сцены', () => {
    const anim = threeFrames();
    expect(spriteBoundaries(anim, 600)).toEqual([0, 100, 300]);
    expect(spriteBoundaries(anim, 800)).toEqual([0, 100, 300, 600, 700]);
  });
});

describe('длина сцены', () => {
  it('без движения — ровно по кадрам, как в покадровой анимации', () => {
    const anim = threeFrames();
    expect(hasMotion(anim)).toBe(false);
    expect(sceneDuration(anim)).toBe(600);
    expect(sceneDuration(setFrameDuration(anim, 0, 400))).toBe(900);
  });

  it('с движением — не меньше двух секунд и до последнего ключа', () => {
    const moving = withMotion(threeFrames());
    expect(hasMotion(moving)).toBe(true);
    expect(sceneDuration(moving)).toBe(MIN_MOTION_DURATION);
    const long = { ...moving, tracks: setKey(moving.tracks, moving.tracks[0], 3500, [1]) };
    expect(sceneDuration(long)).toBe(3500);
  });

  it('один ключ — ещё не движение', () => {
    const doc = createDocument({ width: 2, height: 2 });
    const anim = createAnimation(doc);
    const still = {
      ...anim,
      tracks: setKey([], { node: 'layer', id: doc.layers[0].id, property: 'opacity' }, 700, [1]),
    };
    expect(hasMotion(still)).toBe(false);
    expect(sceneDuration(still)).toBe(700);
  });

  it('эффект на видимом слое — движение, на скрытом — нет', () => {
    const doc = createDocument({ width: 2, height: 2 });
    const layerId = doc.layers[0].id;
    const lit = updateLayer(doc, layerId, { effects: [createEffect('fire')] });
    expect(hasMotion(createAnimation(lit))).toBe(true);
    expect(sceneDuration(createAnimation(lit))).toBe(MIN_MOTION_DURATION);
    expect(hasMotion(createAnimation(updateLayer(lit, layerId, { visible: false })))).toBe(false);
  });

  it('заданная руками длина берётся как есть', () => {
    expect(sceneDuration({ ...withMotion(threeFrames()), duration: 750 })).toBe(750);
  });
});

describe('моменты экспорта', () => {
  it('без движения — кадр за кадром со своими длительностями', () => {
    expect(exportSamples(threeFrames())).toEqual([
      { time: 0, delay: 100 },
      { time: 100, delay: 200 },
      { time: 300, delay: 300 },
    ]);
  });

  it('сцена длиннее кадров повторяет их, последний показ обрезан концом сцены', () => {
    expect(exportSamples({ ...threeFrames(), duration: 800 })).toEqual([
      { time: 0, delay: 100 },
      { time: 100, delay: 200 },
      { time: 300, delay: 300 },
      { time: 600, delay: 100 },
      { time: 700, delay: 100 },
    ]);
  });

  it('с движением — такты частоты кадров, последний обрезан концом сцены', () => {
    const anim = { ...withMotion(threeFrames()), fps: 4, duration: 900 };
    expect(exportSamples(anim)).toEqual([
      { time: 0, delay: 250 },
      { time: 250, delay: 250 },
      { time: 500, delay: 250 },
      { time: 750, delay: 150 },
    ]);
    const thirds = exportSamples({ ...anim, fps: 3, duration: 1000 });
    expect(thirds.map((s) => s.time)).toEqual([0, 333.333, 666.667]);
  });

  it('проигрывание показывает те же моменты, что попадут в экспорт', () => {
    const still = threeFrames();
    expect([0, 50, 100, 450, 650].map((t) => sampleTimeAt(still, t))).toEqual([
      0, 0, 100, 300, 600,
    ]);
    const moving = { ...withMotion(still), fps: 20 };
    expect([0, 49.9, 50, 1234].map((t) => sampleTimeAt(moving, t))).toEqual([0, 0, 50, 1200]);
    // Такт, попавший ровно в момент, не уезжает на предыдущий из-за округления.
    expect(tickAt(3, 333.333)).toBe(333.333);
  });
});

describe('шаг по кадрам', () => {
  it('вперёд и назад по началам кадров с переходом через край сцены', () => {
    const anim = threeFrames();
    expect(adjacentFrameTime(anim, 0, 1)).toBe(100);
    expect(adjacentFrameTime(anim, 150, 1)).toBe(300);
    expect(adjacentFrameTime(anim, 300, 1)).toBe(0);
    expect(adjacentFrameTime(anim, 150, -1)).toBe(100);
    expect(adjacentFrameTime(anim, 0, -1)).toBe(300);
  });

  it('за концом сцены шаг идёт дальше по кругам кадров', () => {
    const anim = threeFrames();
    expect(adjacentFrameTime(anim, 650, 1)).toBe(700);
    expect(adjacentFrameTime(anim, 650, -1)).toBe(600);
  });
});
