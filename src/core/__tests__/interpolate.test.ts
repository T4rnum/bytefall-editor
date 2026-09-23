import { describe, expect, it } from 'vitest';
import { tintChannels } from '../animated';
import { EASE_IN } from '../easing';
import { mixValues, valueAt } from '../interpolate';
import { type Interpolation, type Track, createKey } from '../tracks';

function track(interpolation: Interpolation, ...keys: [number, number][]): Track {
  return {
    node: 'object',
    id: 'ball',
    property: 'rotation',
    keys: keys.map(([t, v]) => ({ ...createKey(t, [v], interpolation), easing: EASE_IN })),
  };
}

describe('значение трека во времени', () => {
  it('до первого ключа держит первое, после последнего — последнее', () => {
    const t = track('linear', [100, 10], [200, 20]);
    expect(valueAt(t, 0)).toEqual([10]);
    expect(valueAt(t, 100)).toEqual([10]);
    expect(valueAt(t, 200)).toEqual([20]);
    expect(valueAt(t, 5000)).toEqual([20]);
  });

  it('равномерно идёт по прямой, скачком держит значение до следующего ключа', () => {
    expect(valueAt(track('linear', [0, 0], [100, 10], [300, 50]), 200)).toEqual([30]);
    const step = track('step', [0, 0], [100, 10]);
    expect(valueAt(step, 99.999)).toEqual([0]);
    expect(valueAt(step, 100)).toEqual([10]);
  });

  it('по кривой идёт медленнее в начале разгона', () => {
    const value = valueAt(track('bezier', [0, 0], [100, 100]), 25)[0];
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(25);
  });

  it('интерполяцию отрезка задаёт его левый ключ', () => {
    const mixed: Track = {
      ...track('linear', [0, 0], [100, 10], [200, 20]),
    };
    const keys = [...mixed.keys];
    keys[1] = { ...keys[1], interpolation: 'step' };
    const t = { ...mixed, keys };
    expect(valueAt(t, 50)).toEqual([5]);
    expect(valueAt(t, 150)).toEqual([10]);
  });

  it('одно и то же время всегда даёт одно и то же значение, в любом порядке', () => {
    const t = track('bezier', [0, 0], [333.333, 90], [1000, -45]);
    const moments = [0, 17, 333.333, 500, 999, 1000];
    const forward = moments.map((m) => valueAt(t, m));
    const backward = [...moments]
      .reverse()
      .map((m) => valueAt(t, m))
      .reverse();
    expect(backward).toEqual(forward);
  });
});

describe('смешивание значений', () => {
  it('пары и числа — покомпонентно', () => {
    expect(mixValues('vec2', [0, 10], [10, 20], 0.5)).toEqual([5, 15]);
    expect(mixValues('scalar', [1], [3], 0.25)).toEqual([1.5]);
  });

  it('оттенок из «без оттенка» в красный идёт через красный, а не через тёмно-красный', () => {
    const none = tintChannels(null);
    const red = tintChannels('#ff0000');
    expect(mixValues('color', none, red, 0.5)).toEqual([1, 0, 0, 0.5]);
    expect(mixValues('color', none, none, 0.5)).toEqual([0, 0, 0, 0]);
    const [r, g, b, a] = mixValues('color', red, tintChannels('#0000ff'), 0.5);
    expect([r, g, b, a]).toEqual([0.5, 0, 0.5, 1]);
  });
});
