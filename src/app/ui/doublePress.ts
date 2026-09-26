/** Сколько мс между нажатиями ещё считается двойным щелчком: с запасом на системную настройку. */
const WINDOW_MS = 1000;

export interface PressEvent {
  /** Номер щелчка в серии, как его считает браузер. */
  readonly detail: number;
  readonly timeStamp: number;
}

/**
 * Двойной щелчок, оба нажатия которого пришлись на этот элемент. Браузер склеивает щелчки по
 * месту и времени, а не по элементу: если строку удалили и на её место встала следующая, щелчок
 * по новой строке он засчитает вторым, и она уйдёт в переименование.
 */
export function doublePress(onDouble: () => void): {
  onMouseDown: (event: PressEvent) => void;
  onDoubleClick: (event: PressEvent) => void;
} {
  let first = -Infinity;
  return {
    onMouseDown(event) {
      if (event.detail === 1) first = event.timeStamp;
    },
    onDoubleClick(event) {
      const own = event.timeStamp - first < WINDOW_MS;
      first = -Infinity;
      if (own) onDouble();
    },
  };
}
