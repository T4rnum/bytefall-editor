import { type Cell, makeCell } from '../cell';
import { type CellKey, keyOf } from '../grid';
import { type DitherMode, ditherThreshold, rampLevel } from './dither';
import { edgeGlyphs } from './edges';
import { type PreparedPalette, nearestColor, preparePalette } from './palettes';
import { RAMP_PRESETS } from './ramps';
import { type CellSamples, type RgbaImage, cellsHighFor, sampleImage } from './sample';
import { LUMA_WEIGHTS, type LumaWeights, type Tone, applyTone, luminance } from './tone';

export { type DitherMode, ditherThreshold, rampLevel } from './dither';
export { edgeGlyphs } from './edges';
export {
  PALETTE_PRESETS,
  type PalettePreset,
  nearestColor,
  preparePalette,
  toOklab,
} from './palettes';
export { PRINTABLE_ASCII, RAMP_PRESETS, type RampPreset, rampFromCoverage } from './ramps';
export {
  type CellSamples,
  type RgbaImage,
  cellsHighFor,
  sampleImage,
  subsamplesFor,
} from './sample';
export { LUMA_WEIGHTS, type LumaWeights, type Tone, applyTone, luminance } from './tone';

/**
 * Как ячейка передаёт картинку:
 * - `none` — символы без фона: плотность символа несёт яркость, цвет символа — оттенок;
 * - `blocks` — только фон: цветная мозаика без символов, как пиксель-арт;
 * - `shaded` — символы на приглушённом фоне своего же цвета.
 */
export type BackgroundMode = 'none' | 'blocks' | 'shaded';

export interface QuantizeOptions extends Tone {
  /** Символы от пустого к плотному. Пробел означает пустую ячейку. */
  readonly ramp: string;
  readonly weights: LumaWeights;
  /** Для светлого холста: тёмное становится плотным, а не пустым. */
  readonly invert: boolean;
  readonly dither: DitherMode;
  readonly edges: boolean;
  readonly edgeThreshold: number;
  readonly edgeStrength: number;
  /** Цвета, к которым приводится результат; null — цвета картинки как есть. */
  readonly palette: readonly string[] | null;
  /**
   * Цвет символа — чистый оттенок ячейки на полной яркости: яркость и так несёт плотность
   * символа. Без этого тёмная ячейка получила бы и редкий символ, и тёмный цвет, и пропала бы.
   */
  readonly vivid: boolean;
  readonly background: BackgroundMode;
  /** Ячейки прозрачнее этого пропускаются. */
  readonly alphaThreshold: number;
}

export const DEFAULT_QUANTIZE: QuantizeOptions = {
  ramp: RAMP_PRESETS[0].glyphs,
  weights: 'rec709',
  gamma: 1,
  contrast: 1,
  brightness: 0,
  invert: false,
  dither: 'bayer',
  edges: false,
  edgeThreshold: 0.35,
  edgeStrength: 0.5,
  palette: null,
  vivid: true,
  background: 'none',
  alphaThreshold: 0.5,
};

/** Во сколько раз фон темнее символа в режиме «символы на фоне». */
const SHADE = 0.35;

type Rgb = readonly [number, number, number];

/** Тот же оттенок на полной яркости. Чёрный становится белым: иначе символ на нём не виден. */
function vivid([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  return max > 0 ? [r / max, g / max, b / max] : [1, 1, 1];
}

const scale = ([r, g, b]: Rgb, k: number): Rgb => [r * k, g * k, b * k];

const HEX_BYTES = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
const byte = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);

/**
 * Цвет в hex для ячейки. Ячейки гладкой картинки делят одни и те же цвета, поэтому ответ на
 * каждый 8-битный цвет считается один раз: ближайший цвет палитры ищется в OKLab с кубическими
 * корнями, и считать его на каждую ячейку было бы втрое дольше всего остального.
 */
function painter(palette: PreparedPalette | null): (rgb: Rgb) => string {
  const cache = new Map<number, string>();
  return ([r, g, b]) => {
    const r8 = byte(r);
    const g8 = byte(g);
    const b8 = byte(b);
    const key = (r8 << 16) | (g8 << 8) | b8;
    let hex = cache.get(key);
    if (hex === undefined) {
      hex = palette
        ? nearestColor(palette, r8 / 255, g8 / 255, b8 / 255)
        : `#${HEX_BYTES[r8]}${HEX_BYTES[g8]}${HEX_BYTES[b8]}`;
      cache.set(key, hex);
    }
    return hex;
  };
}

/** Цвет с новой яркостью и прежним оттенком. */
function retone([r, g, b]: Rgb, from: number, to: number): Rgb {
  if (from <= 1e-6) return [to, to, to];
  const k = to / from;
  return [Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k)];
}

/**
 * Сетка ячеек из подготовленной картинки. Чистая функция: одинаковые образцы и настройки дают
 * одинаковый результат, поэтому предпросмотр в диалоге и вставка в документ совпадают.
 */
export function quantize(samples: CellSamples, options: QuantizeOptions): Map<CellKey, Cell> {
  const { width, height, color, alpha } = samples;
  const weights = LUMA_WEIGHTS[options.weights];
  const glyphs = [...(options.ramp || DEFAULT_QUANTIZE.ramp)].map((g) => (g === ' ' ? '' : g));
  const edges =
    options.edges && options.background !== 'blocks'
      ? edgeGlyphs(samples, { threshold: options.edgeThreshold, strength: options.edgeStrength })
      : null;
  const palette =
    options.palette && options.palette.length > 0 ? preparePalette(options.palette) : null;
  const paint = painter(palette);
  const out = new Map<CellKey, Cell>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (alpha[i] < options.alphaThreshold) continue;
      const rgb: Rgb = [color[i * 3], color[i * 3 + 1], color[i * 3 + 2]];
      const lum = luminance(rgb[0], rgb[1], rgb[2], weights);
      const tone = applyTone(lum, options);
      const toned = retone(rgb, lum, tone);
      if (options.background === 'blocks') {
        out.set(keyOf(x, y), makeCell('', '#ffffff', paint(toned)));
        continue;
      }
      const threshold = ditherThreshold(options.dither, x, y);
      const level = rampLevel(options.invert ? 1 - tone : tone, glyphs.length, threshold);
      const glyph = edges?.[i] ?? glyphs[level];
      const bg = options.background === 'shaded' ? paint(scale(toned, SHADE)) : null;
      if (glyph === '' && bg === null) continue;
      out.set(keyOf(x, y), makeCell(glyph, paint(options.vivid ? vivid(rgb) : toned), bg));
    }
  }
  return out;
}

/** Картинка в сетку шириной `cellsWide` ячеек за один вызов: для тестов и разовых конвертаций. */
export function imageToCells(
  image: RgbaImage,
  cellsWide: number,
  options: QuantizeOptions = DEFAULT_QUANTIZE,
): { width: number; height: number; cells: Map<CellKey, Cell> } {
  const height = cellsHighFor(image, cellsWide);
  const samples = sampleImage(image, cellsWide, height);
  return { width: cellsWide, height, cells: quantize(samples, options) };
}
