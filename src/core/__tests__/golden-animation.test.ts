import { describe, expect, it } from 'vitest';
import { type Animation, frameDocument } from '../animation';
import { makeCell } from '../cell';
import { composite } from '../compositor';
import { EASE_IN_OUT } from '../easing';
import { evaluate } from '../evaluate';
import { type ComposedFrame, composeAt, composeFrame } from '../frame';
import { keyOf } from '../grid';
import { readInstance } from '../instances';
import { setLayerCells } from '../document';
import { bufferToText } from '../text';
import { exportSamples } from '../timeline';
import { type TrackTarget, setKey, setKeysInterpolation, trackKey } from '../tracks';
import { dumpFrame } from './helpers/dumpFrame';
import { BALL, rollingBall } from './helpers/ballScene';

/**
 * Золотые снимки анимации: что попадает в экспорт в каждый его момент. Экран и экспорт зовут
 * один `evaluate`, поэтому снимок фиксирует и то, что видно при проигрывании.
 */

const ball = (property: 'rotation' | 'tint' | 'opacity'): TrackTarget => ({
  node: 'object',
  id: BALL,
  property,
});

/** Мяч катится по полу, разгоняясь, поворачивается на прямой угол, краснеет и тускнеет. */
function scene(): Animation {
  const { anim, layerId } = rollingBall();
  let tracks = setKeysInterpolation(
    anim.tracks,
    [{ track: trackKey({ node: 'object', id: BALL, property: 'position' }), time: 0 }],
    'bezier',
    EASE_IN_OUT,
  );
  tracks = setKey(setKey(tracks, ball('rotation'), 0, [0]), ball('rotation'), 1000, [90]);
  tracks = setKey(setKey(tracks, ball('tint'), 0, [1, 0, 0, 0]), ball('tint'), 1000, [1, 0, 0, 1]);
  tracks = setKey(setKey(tracks, ball('opacity'), 0, [1]), ball('opacity'), 600, [0.5]);
  tracks = setKeysInterpolation(tracks, [{ track: trackKey(ball('opacity')), time: 0 }], 'step');
  const floor = new Map(
    Array.from({ length: 8 }, (_, x) => [keyOf(x, 3), makeCell('=', '#808080')] as const),
  );
  const frame = frameDocument(anim, 0);
  const doc = setLayerCells(frame, layerId, floor);
  return {
    ...anim,
    frames: [{ ...anim.frames[0], layers: doc.layers }],
    tracks,
    fps: 5,
    duration: 1000,
  };
}

const n = (v: number): string => (Math.abs(v) < 5e-7 ? '0' : String(Math.round(v * 1e4) / 1e4));

/** Кадр экспорта построчно: ячейки прохода и символы потока с позицией, поворотом и цветом. */
function dumpComposed(frame: ComposedFrame): string {
  return frame.passes
    .map((pass) => {
      if (pass.kind === 'cells') return `cells\n${dumpFrame(pass.buffer)}`;
      const lines = ['glyphs'];
      for (let i = 0; i < pass.batch.count; i++) {
        const g = readInstance(pass.batch, i);
        const rgba = [g.fg.r, g.fg.g, g.fg.b, g.fg.a].map((c) => Math.round(c * 255));
        lines.push(`'${g.glyph}' at ${n(g.x)},${n(g.y)} rot ${n(g.rot)} fg ${rgba.join(',')}`);
      }
      return `${lines.join('\n')}\n`;
    })
    .join('');
}

describe('экспорт анимации', () => {
  it('моменты экспорта — такты частоты сцены до её конца', () => {
    expect(exportSamples(scene()).map((s) => [s.time, s.delay])).toEqual([
      [0, 200],
      [200, 200],
      [400, 200],
      [600, 200],
      [800, 200],
    ]);
  });

  it('каждый момент экспорта совпадает со снимком', async () => {
    const anim = scene();
    const text = exportSamples(anim)
      .map(({ time }) => {
        const flat = bufferToText(composite(evaluate(anim, time), null, undefined, [], time));
        return `t=${time}\n${dumpComposed(composeAt(anim, time))}text:\n${flat}\n`;
      })
      .join('\n');
    await expect(text).toMatchFileSnapshot('./golden/animation-roll.txt');
  });

  it('перемотка в любом порядке даёт те же кадры, что проигрывание подряд', () => {
    const anim = scene();
    const moments = [0, 137, 200, 333.333, 512, 800, 999, 1000, 4000];
    const forward = moments.map((t) => dumpComposed(composeAt(anim, t)));
    const shuffled = [4, 0, 8, 2, 6, 1, 7, 3, 5].map(
      (i) => [i, dumpComposed(composeAt(anim, moments[i]))] as const,
    );
    for (const [i, dump] of shuffled) expect(dump).toBe(forward[i]);
  });

  it('кадр экспорта — это кадр экрана без служебного', () => {
    const anim = scene();
    for (const { time } of exportSamples(anim)) {
      const screen = composeFrame(evaluate(anim, time), null, null, [], time);
      expect(dumpComposed(composeAt(anim, time))).toBe(dumpComposed(screen));
    }
  });
});
