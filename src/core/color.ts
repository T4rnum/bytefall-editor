/** Цвет в долях 0..1. Редактор работает в sRGB как есть, без гамма-преобразований. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Разбирает #rgb, #rgba, #rrggbb, #rrggbbaa. Бросает ошибку на невалидной строке. */
export function parseHex(hex: string): Rgba {
  if (!isHexColor(hex)) throw new Error(`Invalid hex color: ${String(hex)}`);
  let digits = hex.slice(1);
  if (digits.length <= 4) digits = [...digits].map((c) => c + c).join('');
  const n = parseInt(digits.slice(0, 6), 16);
  const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
}

const toByte = (v: number): string =>
  Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, '0');

/** #rrggbb, либо #rrggbbaa если альфа меньше единицы. */
export function toHex(color: Rgba): string {
  const base = `#${toByte(color.r)}${toByte(color.g)}${toByte(color.b)}`;
  return color.a >= 1 ? base : base + toByte(color.a);
}

/** Приводит любую валидную hex-запись к канонической: нижний регистр, 6 или 8 цифр. */
export function normalizeHex(hex: string): string {
  return toHex(parseHex(hex));
}

/** Классическое наложение "over": верхний цвет поверх нижнего. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const ta = clamp01(top.a);
  const ba = clamp01(bottom.a);
  const outA = ta + ba * (1 - ta);
  if (outA <= 0) return TRANSPARENT;
  const mix = (t: number, b: number): number => (t * ta + b * ba * (1 - ta)) / outA;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: outA };
}

/** Умножает альфу цвета на коэффициент, например на непрозрачность слоя. */
export function withAlpha(color: Rgba, factor: number): Rgba {
  return { r: color.r, g: color.g, b: color.b, a: clamp01(color.a * factor) };
}
