import { type InputSpec, type NumberSource, type OutputSpec, sample } from './types';

/** Числовой вход: значение по умолчанию и пределы для поля, файла и ключей. */
export const numIn = (
  name: string,
  label: string,
  def: number,
  min: number,
  max: number,
  integer?: boolean,
): InputSpec => ({ name, label, type: 'number', default: def, min, max, integer });

export const glyphsIn = (name = 'glyphs', label = 'Символы'): InputSpec => ({
  name,
  label,
  type: 'glyphs',
});

export const numOut = (name: string, label: string): OutputSpec => ({
  name,
  label,
  type: 'number',
});

export const glyphsOut = (name = 'glyphs', label = 'Символы'): OutputSpec => ({
  name,
  label,
  type: 'glyphs',
});

/** Период, мс: 0 — не меняется со временем. */
export const PERIOD_MAX = 600000;
/** Длина в ячейках: волна, градиент, радиус. */
export const LENGTH_MIN = 0.5;
export const LENGTH_MAX = 2048;
/** Предел свободного числа: с запасом на всё, что бывает на холсте, но не бесконечность. */
export const FREE = 1e6;

/**
 * Число из чисел: если все постоянные — постоянное, иначе поле, которое считает `fn` для каждого
 * символа потока. Так граф без полей не платит за проход по символам.
 */
export function lift(
  fn: (...values: number[]) => number,
  ...sources: readonly NumberSource[]
): NumberSource {
  if (sources.every((s) => typeof s === 'number')) return fn(...(sources as number[]));
  return (poses) => {
    const [a, b, c, d, e] = sources.map((s) => sample(s, poses));
    const out = new Float64Array(poses.length);
    // Без массива аргументов на символ: вызов с тем числом чисел, что есть у узла.
    switch (sources.length) {
      case 1:
        for (let i = 0; i < out.length; i++) out[i] = fn(a[i]);
        break;
      case 2:
        for (let i = 0; i < out.length; i++) out[i] = fn(a[i], b[i]);
        break;
      case 3:
        for (let i = 0; i < out.length; i++) out[i] = fn(a[i], b[i], c[i]);
        break;
      case 4:
        for (let i = 0; i < out.length; i++) out[i] = fn(a[i], b[i], c[i], d[i]);
        break;
      case 5:
        for (let i = 0; i < out.length; i++) out[i] = fn(a[i], b[i], c[i], d[i], e[i]);
        break;
      default:
        throw new Error(`lift: ${sources.length} inputs`);
    }
    return out;
  };
}
