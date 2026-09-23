/** Планировщик на следующий кадр. В браузере — requestAnimationFrame, в тестах — подставной. */
export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface FrameThrottle<T> {
  /** Запомнить значение; применится последнее из пришедших за кадр. */
  push(value: T): void;
  /** Применить отложенное значение прямо сейчас, если оно есть. */
  flush(): void;
  /** Забыть отложенное значение, ничего не применяя. */
  cancel(): void;
}

const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * Не чаще одного применения за кадр. Значения, пришедшие между кадрами, схлопываются в последнее:
 * промежуточные никто не успел бы увидеть, а обработка каждого стоила бы кадров.
 *
 * Нужна там, где события приходят не в такт экрану. Движения мыши браузер сам выравнивает по
 * кадрам, а системная палитра `input[type=color]` шлёт `input` с частотой опроса мыши — у
 * игровой мыши это до тысячи раз в секунду.
 */
export function createFrameThrottle<T>(
  apply: (value: T) => void,
  scheduler: FrameScheduler = browserScheduler,
): FrameThrottle<T> {
  let pending: { value: T } | null = null;
  let handle: number | null = null;

  const run = (): void => {
    handle = null;
    const next = pending;
    pending = null;
    if (next) apply(next.value);
  };

  return {
    push(value) {
      pending = { value };
      if (handle === null) handle = scheduler.request(run);
    },
    flush() {
      if (handle !== null) scheduler.cancel(handle);
      run();
    },
    cancel() {
      if (handle !== null) scheduler.cancel(handle);
      handle = null;
      pending = null;
    },
  };
}
