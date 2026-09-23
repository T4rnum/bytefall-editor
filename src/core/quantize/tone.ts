/** Веса яркости: как смешать красный, зелёный и синий в одно число. */
export type LumaWeights = 'rec709' | 'rec601' | 'average';

export const LUMA_WEIGHTS: Readonly<Record<LumaWeights, readonly [number, number, number]>> = {
  // Как видит глаз на современном экране: зелёный заметно ярче синего.
  rec709: [0.2126, 0.7152, 0.0722],
  // Старое телевизионное соотношение: красного чуть больше.
  rec601: [0.299, 0.587, 0.114],
  average: [1 / 3, 1 / 3, 1 / 3],
};

/** Настройки яркости: то, что художник крутит, пока картинка не начнёт читаться символами. */
export interface Tone {
  /** 0.2..5: больше единицы осветляет средние тона, меньше — затемняет. */
  readonly gamma: number;
  /** 0..3: единица — как есть. */
  readonly contrast: number;
  /** −1..1: сдвиг яркости. */
  readonly brightness: number;
}

export const luminance = (
  r: number,
  g: number,
  b: number,
  weights: readonly [number, number, number],
): number => weights[0] * r + weights[1] * g + weights[2] * b;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Яркость 0..1 после контраста, сдвига и гаммы. */
export function applyTone(value: number, tone: Tone): number {
  const shifted = clamp01((value - 0.5) * tone.contrast + 0.5 + tone.brightness);
  return shifted ** (1 / tone.gamma);
}
