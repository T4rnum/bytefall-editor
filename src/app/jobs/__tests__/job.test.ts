import { describe, expect, it } from 'vitest';
import { JobCancelled, SLICE_MS, createJobContext, yieldToBrowser } from '../job';

describe('фоновая работа', () => {
  it('отдаёт поток, только когда кусок работы длиннее кадра, и сообщает прогресс', async () => {
    let clock = 0;
    let pauses = 0;
    const progress: string[] = [];
    const job = createJobContext(
      new AbortController().signal,
      (done, total) => progress.push(`${done}/${total}`),
      () => clock,
      () => {
        pauses++;
        return Promise.resolve();
      },
    );
    await job.step(1, 3);
    clock += SLICE_MS + 1;
    await job.step(2, 3);
    await job.step(3, 3);
    expect(progress).toEqual(['1/3', '2/3', '3/3']);
    expect(pauses).toBe(1);
  });

  it('отмена прерывает работу на ближайшем шаге, и во время передышки тоже', async () => {
    const controller = new AbortController();
    let clock = 0;
    const job = createJobContext(
      controller.signal,
      () => undefined,
      () => (clock += SLICE_MS + 1),
      () => {
        controller.abort();
        return Promise.resolve();
      },
    );
    await expect(job.step(1, 2)).rejects.toBeInstanceOf(JobCancelled);
    await expect(job.step(2, 2)).rejects.toBeInstanceOf(JobCancelled);
  });

  it('передышка — через очередь сообщений, не раньше текущей работы', async () => {
    const order: string[] = [];
    const pause = yieldToBrowser().then(() => order.push('после'));
    order.push('сейчас');
    await pause;
    expect(order).toEqual(['сейчас', 'после']);
  });
});
