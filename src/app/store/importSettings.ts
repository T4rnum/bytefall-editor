import { isHexColor } from '../../core/color';
import {
  type BackgroundMode,
  DEFAULT_QUANTIZE,
  type DitherMode,
  type LumaWeights,
  PALETTE_PRESETS,
  PRINTABLE_ASCII,
  type QuantizeOptions,
  RAMP_PRESETS,
  type RgbaImage,
  rampFromCoverage,
} from '../../core/quantize';
import type { GlyphCoverage } from '../../core/thumbnail';
import { readSetting, writeSetting } from '../ui/persist';

/**
 * Всё, что крутят в диалоге импорта. Рампа и палитра — выбор из списка, а не сами символы и
 * цвета: «из шрифта» и «палитра документа» раскрываются в момент конвертации.
 */
export interface ImportSettings {
  /** Ширина результата в ячейках: высоту даёт пропорция картинки. */
  readonly width: number;
  readonly fitCanvas: boolean;
  /** 'font', 'custom' или id готовой рампы. */
  readonly ramp: string;
  readonly customRamp: string;
  readonly weights: LumaWeights;
  readonly gamma: number;
  readonly contrast: number;
  readonly brightness: number;
  readonly invert: boolean;
  readonly dither: DitherMode;
  readonly edges: boolean;
  readonly edgeThreshold: number;
  readonly edgeStrength: number;
  /** 'image', 'document', 'mono' или id готовой палитры. */
  readonly palette: string;
  readonly monoColor: string;
  readonly vivid: boolean;
  readonly background: BackgroundMode;
}

type Style = Omit<ImportSettings, 'width' | 'fitCanvas'>;

const DEFAULT_STYLE: Style = {
  ramp: 'font',
  customRamp: RAMP_PRESETS[0].glyphs,
  weights: DEFAULT_QUANTIZE.weights,
  gamma: DEFAULT_QUANTIZE.gamma,
  contrast: DEFAULT_QUANTIZE.contrast,
  brightness: DEFAULT_QUANTIZE.brightness,
  invert: DEFAULT_QUANTIZE.invert,
  dither: DEFAULT_QUANTIZE.dither,
  edges: DEFAULT_QUANTIZE.edges,
  edgeThreshold: DEFAULT_QUANTIZE.edgeThreshold,
  edgeStrength: DEFAULT_QUANTIZE.edgeStrength,
  palette: 'image',
  monoColor: '#ffffff',
  vivid: DEFAULT_QUANTIZE.vivid,
  background: DEFAULT_QUANTIZE.background,
};

const STYLE_KEYS = Object.keys(DEFAULT_STYLE) as (keyof Style)[];

/** Ступеней в рампе из шрифта: больше — тоньше переходы, но символы становятся похожими. */
const FONT_RAMP_LEVELS = 12;
/** Ширина по умолчанию: крупная картинка не должна сразу становиться полотном в тысячу ячеек. */
const DEFAULT_WIDTH = 160;
const SETTINGS_KEY = 'imageImport';

/**
 * Стиль из прошлого импорта. Значение неподходящего типа берётся по умолчанию: хранилище могла
 * записать старая версия редактора.
 */
export function loadStyle(): Style {
  const stored = readSetting<Partial<Record<keyof Style, unknown>>>(SETTINGS_KEY, {});
  const style: Record<string, unknown> = { ...DEFAULT_STYLE };
  for (const key of STYLE_KEYS) {
    const value = stored?.[key];
    if (typeof value === typeof DEFAULT_STYLE[key]) style[key] = value;
  }
  if (!isHexColor(style.monoColor)) style.monoColor = DEFAULT_STYLE.monoColor;
  return style as unknown as Style;
}

/** Запоминает стиль до следующего импорта. Размер не запоминается: он зависит от картинки. */
export function saveStyle(settings: ImportSettings): void {
  writeSetting(SETTINGS_KEY, Object.fromEntries(STYLE_KEYS.map((key) => [key, settings[key]])));
}

/** Настройки для новой картинки: стиль прошлого раза, размер — по картинке и холсту. */
export function initialSettings(
  image: RgbaImage,
  doc: { readonly width: number },
  fitCanvas: boolean,
): ImportSettings {
  const limit = fitCanvas ? DEFAULT_WIDTH : doc.width;
  return { ...loadStyle(), width: Math.max(8, Math.min(image.width, limit)), fitCanvas };
}

/** Параметры конвертера из настроек диалога. */
export function quantizeOptionsOf(
  settings: ImportSettings,
  context: { readonly coverage: GlyphCoverage; readonly documentPalette: readonly string[] },
): QuantizeOptions {
  const ramp =
    settings.ramp === 'font'
      ? rampFromCoverage(PRINTABLE_ASCII, context.coverage, FONT_RAMP_LEVELS)
      : settings.ramp === 'custom'
        ? settings.customRamp || DEFAULT_QUANTIZE.ramp
        : (RAMP_PRESETS.find((r) => r.id === settings.ramp)?.glyphs ?? DEFAULT_QUANTIZE.ramp);
  const palette =
    settings.palette === 'image'
      ? null
      : settings.palette === 'document'
        ? context.documentPalette
        : settings.palette === 'mono'
          ? [settings.monoColor]
          : (PALETTE_PRESETS.find((p) => p.id === settings.palette)?.colors ?? null);
  return {
    ...DEFAULT_QUANTIZE,
    ramp,
    palette,
    weights: settings.weights,
    gamma: settings.gamma,
    contrast: settings.contrast,
    brightness: settings.brightness,
    invert: settings.invert,
    dither: settings.dither,
    edges: settings.edges,
    edgeThreshold: settings.edgeThreshold,
    edgeStrength: settings.edgeStrength,
    vivid: settings.vivid,
    background: settings.background,
  };
}
