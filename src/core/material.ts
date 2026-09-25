import { colorOf } from './cellBuffer';

/**
 * GPU-материал объекта (DESIGN.md, раздел 4.5): меняет, как символы выглядят, а не какие они и
 * где. Контур и свечение работают с формой символа по пикселям, поэтому живут в шейдере потока
 * символов: они есть на экране, в PNG и в GIF, но не в тексте — у текста нет ни того ни другого.
 */
export interface OutlineMaterial {
  readonly color: string;
  /** Толщина в пикселях шрифта. */
  readonly width: number;
}

export interface GlowMaterial {
  readonly color: string;
  /** Радиус в ячейках. */
  readonly radius: number;
  /** Насколько плотное свечение: 1 — как сам символ у края, больше — ярче и шире на вид. */
  readonly strength: number;
}

/** Блик: светлые полосы бегут по символам под углом, как отражение на стекле. */
export interface ShineMaterial {
  readonly color: string;
  /** Ширина полосы, ячейки. */
  readonly width: number;
  /** Расстояние между полосами, ячейки. */
  readonly spacing: number;
  /** Скорость, ячейки в секунду; 0 — полосы стоят. */
  readonly speed: number;
  /** Направление движения, градусы по часовой от оси X. */
  readonly angle: number;
}

/** Дизеринг: символ проступает узором Байера по пикселям шрифта. */
export interface DitherMaterial {
  /** Доля пикселей символа, которые пропадают, 0..1. */
  readonly amount: number;
}

export interface GlyphMaterial {
  readonly outline: OutlineMaterial | null;
  readonly glow: GlowMaterial | null;
  readonly shine: ShineMaterial | null;
  readonly dither: DitherMaterial | null;
}

/** Пиксель шрифта в долях ячейки: Press Start 2P рисует символ на сетке 8×8. */
export const FONT_PIXEL = 1 / 8;
export const MAX_OUTLINE_WIDTH = 4;
export const MAX_GLOW_RADIUS = 2;
export const MAX_GLOW_STRENGTH = 4;

export const DEFAULT_OUTLINE: OutlineMaterial = { color: '#000000', width: 1 };
export const DEFAULT_GLOW: GlowMaterial = { color: '#ffec27', radius: 0.5, strength: 1.5 };
export const DEFAULT_SHINE: ShineMaterial = {
  color: '#ffffff',
  width: 1,
  spacing: 12,
  speed: 8,
  angle: 30,
};
export const DEFAULT_DITHER: DitherMaterial = { amount: 0.5 };
export const MAX_SHINE_SPEED = 256;

export const hasMaterial = (material: GlyphMaterial | null): material is GlyphMaterial =>
  material !== null &&
  (material.outline !== null ||
    material.glow !== null ||
    material.shine !== null ||
    material.dither !== null);

/** Материал меняется со временем: бегущий блик. Такой объект — движение для экспорта и часов. */
export const isAnimatedMaterial = (material: GlyphMaterial | null): boolean =>
  material?.shine != null && material.shine.speed !== 0;

/** Числа материала для потока символов, по `MATERIAL_FLOATS` на символ. */
export const MATERIAL_FLOATS = 17;
/**
 * Смещения внутри чисел материала: контур — цвет и толщина в ячейках, свечение — цвет, радиус
 * и сила, блик — цвет и ширина, затем шаг, скорость и угол в радианах, в конце — дизеринг.
 */
export const MATERIAL = {
  outline: 0,
  glow: 4,
  glowStrength: 8,
  shine: 9,
  shineMotion: 13,
  dither: 16,
} as const;

/**
 * Материал в числа для потока символов. Одинаков для всех символов объекта, поэтому считается раз
 * на объект. Без материала — null, и символы идут в поток нулями: шейдер их пропускает.
 */
export function materialFloats(material: GlyphMaterial | null): Float32Array | null {
  if (!hasMaterial(material)) return null;
  const out = new Float32Array(MATERIAL_FLOATS);
  if (material.outline) {
    const c = colorOf(material.outline.color);
    out.set([c.r, c.g, c.b, material.outline.width * FONT_PIXEL], MATERIAL.outline);
  }
  if (material.glow) {
    const c = colorOf(material.glow.color);
    out.set([c.r, c.g, c.b, material.glow.radius], MATERIAL.glow);
    out[MATERIAL.glowStrength] = material.glow.strength;
  }
  if (material.shine) {
    const { color, width, spacing, speed, angle } = material.shine;
    const c = colorOf(color);
    out.set([c.r, c.g, c.b, width, spacing, speed, (angle * Math.PI) / 180], MATERIAL.shine);
  }
  if (material.dither) out[MATERIAL.dither] = material.dither.amount;
  return out;
}

/** Материал с правкой одной части: пустой материал становится null. */
export function withMaterialPart(
  material: GlyphMaterial | null,
  patch: Partial<GlyphMaterial>,
): GlyphMaterial | null {
  const next = {
    outline: material?.outline ?? null,
    glow: material?.glow ?? null,
    shine: material?.shine ?? null,
    dither: material?.dither ?? null,
    ...patch,
  };
  return hasMaterial(next) ? next : null;
}
