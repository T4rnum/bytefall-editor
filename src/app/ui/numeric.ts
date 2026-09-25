/**
 * Числовая логика поля с перетаскиванием. Вынесена отдельно от React, потому что здесь живут
 * все нетривиальные решения: округление шага, точность, чувствительность драга. Всё это
 * покрывается обычными юнит-тестами, а на долю компонента остаётся только работа с указателем.
 */

export interface NumericRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Режим точности: зажатый Shift даёт мелкий шаг, Ctrl — крупный. */
export type DragMode = 'fine' | 'normal' | 'coarse';

/** Пикселей перетаскивания на один шаг. Подобрано так, чтобы жест ощущался как в Blender. */
const PIXELS_PER_STEP = 4;
const FINE_FACTOR = 0.1;
const COARSE_FACTOR = 10;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Сколько знаков после запятой подразумевает шаг. Шаг 0.05 даёт 2, шаг 1 даёт 0.
 * Нужно, чтобы накопление дробных шагов не превращалось в 0.30000000000000004.
 */
export function precisionOf(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const text = String(step);
  if (text.includes('e') || text.includes('E')) {
    // Экспоненциальная запись: 1e-7 и подобные.
    const exponent = Number(text.slice(text.indexOf('e') + 1));
    return exponent < 0 ? Math.min(-exponent, 20) : 0;
  }
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : Math.min(text.length - dot - 1, 20);
}

/** Убирает хвост двоичного представления, оставляя ровно значимые знаки. */
export function roundTo(value: number, precision: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(clamp(precision, 0, 20)));
}

/** Самый мелкий достижимый шаг даёт на один знак больше обычного: мелкий режим делит на десять. */
const finePrecision = (range: NumericRange): number => precisionOf(range.step) + 1;

export function stepFor(range: NumericRange, mode: DragMode): number {
  if (mode === 'normal') return range.step;
  const factor = mode === 'fine' ? FINE_FACTOR : COARSE_FACTOR;
  // Умножение на 0.1 даёт хвост вида 0.005000000000000001, а по нему потом считается точность.
  return roundTo(range.step * factor, finePrecision(range));
}

/**
 * Приводит значение к сетке шага, отсчитывая её от min: при min=1 и step=2 допустимы 1, 3, 5.
 * Так поле не выдаёт значений, которых нельзя достичь стрелками.
 */
export function snapToStep(value: number, range: NumericRange, mode: DragMode = 'normal'): number {
  const step = stepFor(range, mode);
  if (step <= 0) return clamp(value, range.min, range.max);
  const base = Number.isFinite(range.min) ? range.min : 0;
  const snapped = base + Math.round((value - base) / step) * step;
  return clamp(roundTo(snapped, precisionOf(step)), range.min, range.max);
}

/**
 * Значение по накопленному перетаскиванию. Считается от значения на момент начала жеста,
 * а не наращивается по кадрам: иначе ошибка округления копится и число уползает.
 *
 * Вправо и вверх увеличивают, влево и вниз уменьшают. Диагональ складывается, поэтому жест
 * работает одинаково и для узких, и для широких полей.
 */
export function valueFromDrag(
  startValue: number,
  dx: number,
  dy: number,
  range: NumericRange,
  mode: DragMode = 'normal',
): number {
  const step = stepFor(range, mode);
  const steps = Math.round((dx - dy) / PIXELS_PER_STEP);
  return snapToStep(startValue + steps * step, range, mode);
}

/** Один щелчок колеса или нажатие стрелки. */
export function valueFromNudge(
  value: number,
  direction: number,
  range: NumericRange,
  mode: DragMode = 'normal',
): number {
  return snapToStep(value + Math.sign(direction) * stepFor(range, mode), range, mode);
}

/**
 * Показывает столько знаков, сколько нужно самому мелкому достижимому шагу: иначе значение,
 * набранное с зажатым Shift, выглядело бы застывшим, хотя на деле менялось.
 * Лишние нули не печатаются, поэтому обычные значения выглядят как раньше.
 */
export function formatNumber(value: number, range: NumericRange): string {
  return String(roundTo(value, finePrecision(range)));
}

/**
 * Разбирает то, что напечатал пользователь. Запятая принимается как десятичный разделитель:
 * на русской раскладке её набрать проще, а вреда от этого нет.
 * Невнятный ввод возвращает fallback, а не NaN и не ноль — поле не должно терять значение.
 */
export function parseNumber(text: string, fallback: number, range: NumericRange): number {
  const trimmed = text.trim().replace(',', '.');
  // Number('') равен нулю, а не NaN, поэтому пустую строку надо отсечь до разбора:
  // иначе очистка поля молча выставила бы минимум диапазона.
  if (trimmed === '') return clamp(fallback, range.min, range.max);
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return clamp(fallback, range.min, range.max);
  return clamp(roundTo(parsed, precisionOf(range.step)), range.min, range.max);
}

/** Режим по модификаторам события указателя или клавиатуры. */
export function dragModeOf(event: {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}): DragMode {
  if (event.shiftKey) return 'fine';
  if (event.ctrlKey || event.metaKey) return 'coarse';
  return 'normal';
}
