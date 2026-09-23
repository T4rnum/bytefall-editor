import { describe, expect, it } from 'vitest';
import { type FrameScheduler, createFrameThrottle } from '../frameThrottle';

/** Кадры вручную: `tick` — это «браузер нарисовал кадр». */
function fakeFrames() {
  const queue = new Map<number, () => void>();
  let next = 1;
  const scheduler: FrameScheduler = {
    request: (callback) => {
      queue.set(next, callback);
      return next++;
    },
    cancel: (handle) => void queue.delete(handle),
  };
  const tick = (): void => {
    const callbacks = [...queue.values()];
    queue.clear();
    for (const callback of callbacks) callback();
  };
  return { scheduler, tick, pending: () => queue.size };
}

describe('createFrameThrottle', () => {
  it('сотня значений между кадрами даёт одно применение — последнего', () => {
    const frames = fakeFrames();
    const applied: number[] = [];
    const throttle = createFrameThrottle<number>((v) => applied.push(v), frames.scheduler);
    for (let i = 0; i < 100; i++) throttle.push(i);
    expect(applied).toEqual([]);
    expect(frames.pending()).toBe(1);
    frames.tick();
    expect(applied).toEqual([99]);
  });

  it('в каждом кадре применяется своё последнее значение', () => {
    const frames = fakeFrames();
    const applied: string[] = [];
    const throttle = createFrameThrottle<string>((v) => applied.push(v), frames.scheduler);
    throttle.push('a');
    throttle.push('b');
    frames.tick();
    throttle.push('c');
    frames.tick();
    frames.tick();
    expect(applied).toEqual(['b', 'c']);
  });

  it('flush применяет отложенное сразу и снимает кадр', () => {
    const frames = fakeFrames();
    const applied: number[] = [];
    const throttle = createFrameThrottle<number>((v) => applied.push(v), frames.scheduler);
    throttle.push(1);
    throttle.flush();
    expect(applied).toEqual([1]);
    expect(frames.pending()).toBe(0);
    throttle.flush();
    expect(applied).toEqual([1]);
  });

  it('cancel забывает отложенное, ничего не применяя', () => {
    const frames = fakeFrames();
    const applied: number[] = [];
    const throttle = createFrameThrottle<number>((v) => applied.push(v), frames.scheduler);
    throttle.push(1);
    throttle.cancel();
    frames.tick();
    expect(applied).toEqual([]);
  });
});
