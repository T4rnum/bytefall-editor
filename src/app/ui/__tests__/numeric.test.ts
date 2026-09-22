import { describe, expect, it } from 'vitest';
import {
  type NumericRange,
  clamp,
  dragModeOf,
  formatNumber,
  parseNumber,
  precisionOf,
  roundTo,
  snapToStep,
  stepFor,
  trackFraction,
  valueFromDrag,
  valueFromNudge,
  valueFromTrackDrag,
  valueFromTrackPosition,
} from '../numeric';

const unit: NumericRange = { min: 0, max: 1, step: 0.05 };
const pixels: NumericRange = { min: 1, max: 1024, step: 1 };
const signed: NumericRange = { min: -10, max: 10, step: 0.1 };

describe('clamp', () => {
  it('держит значение в границах', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('precisionOf', () => {
  it('выводит число знаков из шага', () => {
    expect(precisionOf(1)).toBe(0);
    expect(precisionOf(50)).toBe(0);
    expect(precisionOf(0.1)).toBe(1);
    expect(precisionOf(0.05)).toBe(2);
  });

  it('понимает экспоненциальную запись', () => {
    expect(precisionOf(1e-3)).toBe(3);
  });

  it('не падает на бессмысленном шаге', () => {
    expect(precisionOf(0)).toBe(0);
    expect(precisionOf(Number.NaN)).toBe(0);
  });
});

describe('roundTo', () => {
  it('убирает хвост двоичного представления', () => {
    expect(roundTo(0.1 + 0.2, 2)).toBe(0.3);
    expect(roundTo(1 / 3, 3)).toBe(0.333);
  });
});

describe('snapToStep', () => {
  it('кладёт значение на сетку шага', () => {
    expect(snapToStep(0.37, unit)).toBe(0.35);
    expect(snapToStep(0.38, unit)).toBe(0.4);
  });

  it('отсчитывает сетку от min, а не от нуля', () => {
    // min=1, step=2 означает достижимые 1, 3, 5 — но не 4.
    expect(snapToStep(4, { min: 1, max: 9, step: 2 })).toBe(5);
    expect(snapToStep(3.4, { min: 1, max: 9, step: 2 })).toBe(3);
  });

  it('не выпускает значение за границы', () => {
    expect(snapToStep(99, unit)).toBe(1);
    expect(snapToStep(-99, unit)).toBe(0);
  });

  it('накопление дробных шагов не даёт мусорных хвостов', () => {
    let value = 0;
    for (let i = 0; i < 6; i++) value = snapToStep(value + 0.05, unit);
    expect(value).toBe(0.3);
  });
});

describe('stepFor', () => {
  it('Shift уменьшает шаг, Ctrl увеличивает', () => {
    expect(stepFor(pixels, 'normal')).toBe(1);
    expect(stepFor(pixels, 'fine')).toBeCloseTo(0.1);
    expect(stepFor(pixels, 'coarse')).toBe(10);
  });
});

describe('valueFromDrag', () => {
  it('вправо увеличивает, влево уменьшает', () => {
    expect(valueFromDrag(10, 40, 0, pixels)).toBe(20);
    expect(valueFromDrag(10, -40, 0, pixels)).toBe(1);
  });

  it('вверх увеличивает: ось Y экрана смотрит вниз', () => {
    expect(valueFromDrag(10, 0, -40, pixels)).toBe(20);
    expect(valueFromDrag(10, 0, 40, pixels)).toBe(1);
  });

  it('диагональ складывает обе оси', () => {
    expect(valueFromDrag(10, 20, -20, pixels)).toBe(20);
  });

  it('считает от значения на старте жеста, а не наращивает', () => {
    // Дважды один и тот же сдвиг даёт один и тот же результат: дрейфа нет.
    expect(valueFromDrag(0.5, 20, 0, unit)).toBe(valueFromDrag(0.5, 20, 0, unit));
  });

  it('мелкое движение не теряется, а копится до шага', () => {
    expect(valueFromDrag(10, 1, 0, pixels)).toBe(10);
    expect(valueFromDrag(10, 2, 0, pixels)).toBe(11);
    expect(valueFromDrag(10, 6, 0, pixels)).toBe(12);
  });

  it('уважает границы', () => {
    expect(valueFromDrag(1020, 400, 0, pixels)).toBe(1024);
  });

  it('работает с отрицательным диапазоном', () => {
    expect(valueFromDrag(0, -40, 0, signed)).toBeCloseTo(-1);
  });
});

describe('valueFromNudge', () => {
  it('шагает на один шаг в сторону знака', () => {
    expect(valueFromNudge(10, 1, pixels)).toBe(11);
    expect(valueFromNudge(10, -1, pixels)).toBe(9);
  });

  it('упирается в границу, а не выходит за неё', () => {
    expect(valueFromNudge(1, -1, pixels)).toBe(1);
    expect(valueFromNudge(1024, 1, pixels)).toBe(1024);
  });
});

describe('formatNumber', () => {
  it('не печатает лишние нули', () => {
    expect(formatNumber(0.30000000000000004, unit)).toBe('0.3');
    expect(formatNumber(50, pixels)).toBe('50');
  });

  it('показывает мелкий шаг, набранный с Shift', () => {
    // Шаг 1, мелкий шаг 0.1: без этого значение выглядело бы застывшим.
    expect(formatNumber(50.1, pixels)).toBe('50.1');
    expect(formatNumber(0.505, unit)).toBe('0.505');
  });

  it('обрезает то, что мельче достижимого шага', () => {
    expect(formatNumber(12.74, pixels)).toBe('12.7');
  });
});

describe('parseNumber', () => {
  it('разбирает обычное число', () => {
    expect(parseNumber('42', 0, pixels)).toBe(42);
  });

  it('принимает запятую как разделитель', () => {
    expect(parseNumber('0,25', 0, unit)).toBe(0.25);
  });

  it('обрезает по границам', () => {
    expect(parseNumber('9999', 0, pixels)).toBe(1024);
    expect(parseNumber('-5', 0, pixels)).toBe(1);
  });

  it('на мусоре возвращает прежнее значение, а не ноль', () => {
    expect(parseNumber('', 7, pixels)).toBe(7);
    expect(parseNumber('abc', 7, pixels)).toBe(7);
    // Прежнее значение тоже приводится к границам.
    expect(parseNumber('abc', 9999, pixels)).toBe(1024);
  });
});

describe('dragModeOf', () => {
  it('Shift важнее Ctrl', () => {
    const mods = { shiftKey: true, ctrlKey: true, metaKey: false };
    expect(dragModeOf(mods)).toBe('fine');
  });

  it('без модификаторов обычный режим', () => {
    expect(dragModeOf({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe('normal');
  });

  it('Cmd работает как Ctrl', () => {
    expect(dragModeOf({ shiftKey: false, ctrlKey: false, metaKey: true })).toBe('coarse');
  });
});

describe('дорожка ползунка', () => {
  const track = { left: 100, width: 200 };

  it('щелчок по дорожке ставит значение по положению', () => {
    expect(valueFromTrackPosition(track.left, track.left, track.width, pixels)).toBe(1);
    expect(valueFromTrackPosition(track.left + 200, track.left, track.width, pixels)).toBe(1024);
    expect(valueFromTrackPosition(track.left + 100, track.left, track.width, unit)).toBe(0.5);
  });

  it('за пределами дорожки значение упирается в границы', () => {
    expect(valueFromTrackPosition(0, track.left, track.width, unit)).toBe(0);
    expect(valueFromTrackPosition(9999, track.left, track.width, unit)).toBe(1);
  });

  it('перетаскивание считает от значения на старте', () => {
    // Половина дорожки это половина диапазона.
    expect(valueFromTrackDrag(0, 100, track.width, unit)).toBe(0.5);
    expect(valueFromTrackDrag(0.5, -100, track.width, unit)).toBe(0);
  });

  it('Shift замедляет движение по дорожке', () => {
    const normal = valueFromTrackDrag(0.5, 20, track.width, unit, 'normal');
    const fine = valueFromTrackDrag(0.5, 20, track.width, unit, 'fine');
    expect(fine - 0.5).toBeLessThan(normal - 0.5);
    expect(fine).toBeGreaterThan(0.5);
  });

  it('нулевая ширина дорожки не ломает расчёт', () => {
    expect(valueFromTrackDrag(0.5, 50, 0, unit)).toBe(0.5);
    expect(valueFromTrackPosition(50, 0, 0, unit)).toBe(0);
  });

  it('доля заполнения считается от границ диапазона', () => {
    expect(trackFraction(0.5, unit)).toBeCloseTo(0.5);
    expect(trackFraction(-1, unit)).toBe(0);
    expect(trackFraction(99, unit)).toBe(1);
    // Вырожденный диапазон не должен давать деление на ноль.
    expect(trackFraction(5, { min: 5, max: 5, step: 1 })).toBe(0);
  });
});
