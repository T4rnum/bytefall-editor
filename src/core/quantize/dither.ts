/**
 * Дизеринг выбирает между двумя соседними ступенями рампы. Без него при десятке символов на
 * плавном переходе видны полосы, с ним — ровная смесь. Оба варианта упорядоченные: порог
 * зависит только от ячейки, поэтому соседние кадры анимации не мерцают, а малое изменение
 * картинки не разбегается по всему рисунку, как при диффузии ошибки.
 */
export type DitherMode = 'none' | 'bayer' | 'noise';

/** Матрица Байера 4×4: шестнадцать порогов, равномерно разбросанных по квадрату. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const fract = (v: number): number => v - Math.floor(v);

/**
 * Порог 0..1 для ячейки (x, y). `noise` — interleaved gradient noise: шум без сгустков, похожий
 * на синий, но без таблицы в файле.
 */
export function ditherThreshold(mode: DitherMode, x: number, y: number): number {
  if (mode === 'bayer') return (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  if (mode === 'noise') return fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y));
  return 0.5;
}

/** Ступень рампы из `levels` для яркости 0..1: дробная часть сравнивается с порогом. */
export function rampLevel(value: number, levels: number, threshold: number): number {
  const t = value * (levels - 1);
  const base = Math.floor(t);
  return Math.min(levels - 1, base + (t - base > threshold ? 1 : 0));
}
