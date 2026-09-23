import { parseHex } from '../color';

export interface PalettePreset {
  readonly id: string;
  readonly label: string;
  readonly colors: readonly string[];
}

/** Готовые палитры: значения уходят в документ как цвета ячеек, подписи — только в интерфейс. */
export const PALETTE_PRESETS: readonly PalettePreset[] = [
  {
    id: 'pico8',
    label: 'PICO-8',
    colors: [
      '#000000',
      '#1d2b53',
      '#7e2553',
      '#008751',
      '#ab5236',
      '#5f574f',
      '#c2c3c7',
      '#fff1e8',
      '#ff004d',
      '#ffa300',
      '#ffec27',
      '#00e436',
      '#29adff',
      '#83769c',
      '#ff77a8',
      '#ffccaa',
    ],
  },
  { id: 'gameboy', label: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  {
    id: 'gray',
    label: 'Оттенки серого',
    colors: [
      '#000000',
      '#242424',
      '#494949',
      '#6d6d6d',
      '#929292',
      '#b6b6b6',
      '#dbdbdb',
      '#ffffff',
    ],
  },
];

/** Палитра, разобранная один раз на весь конвертер: цвета в OKLab для сравнения. */
export interface PreparedPalette {
  readonly hex: readonly string[];
  readonly lab: Float32Array;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/**
 * sRGB в OKLab (Björn Ottosson, 2020). Расстояние в OKLab близко к тому, как глаз различает
 * цвета: ближайший по нему цвет палитры выглядит ближайшим и на экране, а не только в числах.
 */
export function toOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function preparePalette(colors: readonly string[]): PreparedPalette {
  const lab = new Float32Array(colors.length * 3);
  colors.forEach((hex, i) => {
    const c = parseHex(hex);
    lab.set(toOklab(c.r, c.g, c.b), i * 3);
  });
  return { hex: colors, lab };
}

/** Ближайший цвет палитры к r, g, b долями 0..1. */
export function nearestColor(palette: PreparedPalette, r: number, g: number, b: number): string {
  const [L, A, B] = toOklab(r, g, b);
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.hex.length; i++) {
    const dl = palette.lab[i * 3] - L;
    const da = palette.lab[i * 3 + 1] - A;
    const db = palette.lab[i * 3 + 2] - B;
    const distance = dl * dl + da * da + db * db;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return palette.hex[best];
}
