/**
 * Долгая работа на главном потоке — экспорт рисует кадры на GPU, — которая не вешает редактор:
 * между кусками работы поток отдаётся браузеру, прогресс виден, работу можно отменить.
 */

/** Работу отменили: прерывает её и ошибкой не считается. */
export class JobCancelled extends Error {
  constructor() {
    super('отменено');
    this.name = 'JobCancelled';
  }
}

export interface JobContext {
  readonly signal: AbortSignal;
  /**
   * Сделано `done` из `total`. Если с прошлой передышки прошло больше кадра, отдаёт поток
   * браузеру: интерфейс успевает отрисоваться и принять «Отмену». Отменённую работу прерывает.
   */
  step(done: number, total: number): Promise<void>;
}

/** Сколько работать подряд, прежде чем отдать поток: чуть меньше кадра на 60 Гц. */
export const SLICE_MS = 12;

/** Передышка без минимальной задержки setTimeout: сообщение самому себе через канал. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

export function createJobContext(
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
  now: () => number = () => performance.now(),
  pause: () => Promise<void> = yieldToBrowser,
): JobContext {
  let since = now();
  return {
    signal,
    async step(done, total) {
      if (signal.aborted) throw new JobCancelled();
      onProgress(done, total);
      if (now() - since < SLICE_MS) return;
      await pause();
      since = now();
      if (signal.aborted) throw new JobCancelled();
    },
  };
}
