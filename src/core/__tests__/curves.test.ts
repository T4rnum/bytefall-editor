import { describe, expect, it } from 'vitest';
import {
  LINEAR_EASING,
  easingWithHandle,
  offsetKeyChannel,
  segmentHandles,
  setSegmentEasing,
} from '../curves';
import { EASE_IN_OUT, MAX_EASING_OVERSHOOT } from '../easing';
import { valueAt } from '../interpolate';
import { type Track, type TrackTarget, createKey, findTrack } from '../tracks';

const ROT: TrackTarget = { node: 'object', id: 'o', property: 'rotation' };
const POS: TrackTarget = { node: 'object', id: 'o', property: 'position' };
const OPACITY: TrackTarget = { node: 'object', id: 'o', property: 'opacity' };

const track = (target: TrackTarget, ...keys: ReturnType<typeof createKey>[]): Track => ({
  ...target,
  keys,
});

/** Точка кубической кривой Безье с опорами p0…p3 при параметре s. */
function bezier(p: readonly { x: number; y: number }[], s: number): { x: number; y: number } {
  const u = 1 - s;
  const w = [u * u * u, 3 * u * u * s, 3 * u * s * s, s * s * s];
  return {
    x: w.reduce((sum, k, i) => sum + k * p[i].x, 0),
    y: w.reduce((sum, k, i) => sum + k * p[i].y, 0),
  };
}

describe('ручки перехода — опоры кривой значения', () => {
  it('кривая по ручкам совпадает с тем, что считает evaluate', () => {
    const from = createKey(200, [10], 'bezier', EASE_IN_OUT);
    const to = createKey(1200, [-30], 'linear');
    const handles = segmentHandles(from, to, 0)!;
    expect(handles.out).toEqual({ x: 620, y: 10 });
    expect(handles.in).toEqual({ x: 780, y: -30 });
    const t = track(ROT, from, to);
    const points = [{ x: 200, y: 10 }, handles.out, handles.in, { x: 1200, y: -30 }];
    for (const s of [0.1, 0.3, 0.5, 0.8]) {
      const p = bezier(points, s);
      expect(valueAt(t, p.x)[0]).toBeCloseTo(p.y, 5);
    }
  });

  it('у равномерного перехода ручки на третях, у скачка их нет', () => {
    const to = createKey(300, [9]);
    expect(segmentHandles(createKey(0, [0], 'linear'), to, 0)).toEqual({
      out: { x: 100, y: 3 },
      in: { x: 200, y: 6 },
    });
    expect(segmentHandles(createKey(0, [0], 'step'), to, 0)).toBeNull();
  });
});

describe('кривая из ручки', () => {
  const from = createKey(0, [0, 5], 'linear');
  const to = createKey(1000, [10, 5]);

  it('ручка задаёт две опоры кривой прогресса', () => {
    expect(easingWithHandle(from, to, 0, 'out', { x: 500, y: 7 })).toEqual([
      0.5,
      0.7,
      2 / 3,
      2 / 3,
    ]);
    expect(easingWithHandle(from, to, 0, 'in', { x: 900, y: 10 })).toEqual([1 / 3, 1 / 3, 0.9, 1]);
  });

  it('время ручки не выходит из перехода, значение — за перелёт формата', () => {
    const e = easingWithHandle(from, to, 0, 'out', { x: -400, y: 1000 });
    expect(e[0]).toBe(0);
    expect(e[1]).toBe(MAX_EASING_OVERSHOOT);
  });

  it('у канала без разницы значений ручка двигается только по времени', () => {
    const e = easingWithHandle(from, to, 1, 'out', { x: 250, y: 99 });
    expect(e).toEqual([0.25, LINEAR_EASING[1], 2 / 3, 2 / 3]);
  });

  it('каналы одного ключа делят кривую: ручка X двигает и ручку Y', () => {
    const a = createKey(0, [0, 0], 'linear');
    const b = createKey(1000, [10, 20]);
    const easing = easingWithHandle(a, b, 0, 'out', { x: 100, y: 8 });
    const y = segmentHandles({ ...a, interpolation: 'bezier', easing }, b, 1)!;
    expect(y.out.x).toBeCloseTo(100);
    expect(y.out.y).toBeCloseTo(16);
  });
});

describe('правка ключей из редактора кривых', () => {
  it('переход ключа становится кривой; другие ключи и треки не трогаются', () => {
    const tracks = [track(ROT, createKey(0, [0], 'linear'), createKey(500, [90], 'step'))];
    const out = setSegmentEasing(tracks, ROT, 0, [0.2, 0.9, 0.8, 0.1]);
    const keys = findTrack(out, ROT)!.keys;
    expect(keys[0]).toMatchObject({ interpolation: 'bezier', easing: [0.2, 0.9, 0.8, 0.1] });
    expect(keys[1]).toBe(tracks[0].keys[1]);
    expect(setSegmentEasing(tracks, POS, 0, LINEAR_EASING)).toBe(tracks);
  });

  it('канал ключей сдвигается в пределах свойства', () => {
    const tracks = [
      track(POS, createKey(0, [1, 2]), createKey(500, [3, 4]), createKey(900, [5, 6])),
      track(OPACITY, createKey(0, [0.8]), createKey(500, [0.2])),
    ];
    const moved = offsetKeyChannel(tracks, POS, [0, 900], 1, 10);
    expect(findTrack(moved, POS)!.keys.map((k) => k.value)).toEqual([
      [1, 12],
      [3, 4],
      [5, 16],
    ]);
    const clamped = offsetKeyChannel(tracks, OPACITY, [0, 500], 0, 0.5);
    expect(findTrack(clamped, OPACITY)!.keys.map((k) => k.value[0])).toEqual([1, 0.7]);
    expect(offsetKeyChannel(tracks, POS, [0], 0, 0)).toBe(tracks);
  });
});
