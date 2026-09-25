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

export interface GlyphMaterial {
  readonly outline: OutlineMaterial | null;
  readonly glow: GlowMaterial | null;
}

/** Пиксель шрифта в долях ячейки: Press Start 2P рисует символ на сетке 8×8. */
export const FONT_PIXEL = 1 / 8;
export const MAX_OUTLINE_WIDTH = 4;
export const MAX_GLOW_RADIUS = 2;
export const MAX_GLOW_STRENGTH = 4;

export const DEFAULT_OUTLINE: OutlineMaterial = { color: '#000000', width: 1 };
export const DEFAULT_GLOW: GlowMaterial = { color: '#ffec27', radius: 0.5, strength: 1.5 };

export const hasMaterial = (material: GlyphMaterial | null): material is GlyphMaterial =>
  material !== null && (material.outline !== null || material.glow !== null);

/** Числа материала для потока символов, по `MATERIAL_FLOATS` на символ. */
export const MATERIAL_FLOATS = 9;
/** Смещения внутри числа материала: контур — цвет и толщина в ячейках, свечение — цвет, радиус и сила. */
export const MATERIAL = { outline: 0, glow: 4, glowStrength: 8 } as const;

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
  return out;
}

/** Материал с правкой одной части: пустой материал становится null. */
export function withMaterialPart(
  material: GlyphMaterial | null,
  patch: Partial<GlyphMaterial>,
): GlyphMaterial | null {
  const next = { outline: material?.outline ?? null, glow: material?.glow ?? null, ...patch };
  return hasMaterial(next) ? next : null;
}
