import { type Affine, multiply, rotateScaleAbout } from './affine';
import type { Cell } from './cell';
import { colorOf } from './cellBuffer';
import { TRANSPARENT, toHex } from './color';
import { type GlyphPose, deform, hasActiveDeformers } from './deformers';
import type { Rect } from './geometry';
import { xOf, yOf } from './grid';
import type { SceneObject } from './object';
import { centerPivot } from './transform';

/** Объект, чьи символы двигает хотя бы один включённый деформер. Он всегда свободный. */
export const isDeformed = (obj: SceneObject): boolean => hasActiveDeformers(obj.deformers);

/**
 * Символы объекта в момент `time` после стека деформеров, в координатах объекта. На входе стека
 * — ячейки с правками символов: ручная доводка остаётся доступной, и стек читает её как вход.
 */
export function deformedPoses(
  obj: SceneObject,
  time: number,
  rig?: ReadonlyMap<string, Affine>,
): GlyphPose[] {
  const poses: GlyphPose[] = [];
  for (const [key, cell] of obj.cells) {
    const o = obj.overrides.get(key);
    poses.push({
      key,
      particle: null,
      glyph: cell.glyph,
      x: xOf(key) + 0.5 + (o?.dx ?? 0),
      y: yOf(key) + 0.5 + (o?.dy ?? 0),
      rot: o?.rot ?? 0,
      sx: o?.sx ?? 1,
      sy: o?.sy ?? 1,
      fg: colorOf(cell.fg),
      bg: cell.bg === null ? TRANSPARENT : colorOf(cell.bg),
    });
  }
  return deform(poses, obj.deformers, { time, center: centerPivot(obj.cells), rig });
}

/** Символ в координаты документа: поворот и масштаб вокруг его центра, потом объект. */
export const poseMatrix = (world: Affine, p: GlyphPose): Affine =>
  multiply(world, rotateScaleAbout(p.rot, p.sx, p.sy, { x: 0, y: 0 }, { x: p.x, y: p.y }));

/**
 * Деформированный объект в ячейки прямым путём (DESIGN.md, раздел 2): деформер не обратить,
 * поэтому каждый символ сам ищет ячейку под своим центром. Позже по порядку перекрывает
 * раньше, как и при отрисовке. Так деформированный объект попадает в текст и миниатюры.
 */
export function rasterizeDeformed(
  obj: SceneObject,
  world: Affine,
  time: number,
  clip: Rect,
  visit: (x: number, y: number, cell: Cell) => void,
  rig?: ReadonlyMap<string, Affine>,
): void {
  for (const p of deformedPoses(obj, time, rig)) {
    const m = poseMatrix(world, p);
    const x = Math.floor(m.e);
    const y = Math.floor(m.f);
    if (x < clip.x || y < clip.y || x >= clip.x + clip.w || y >= clip.y + clip.h) continue;
    const fg = toHex(p.fg);
    // Частица родом не из ячейки: у неё только символ и цвет, фона нет.
    const source: Cell =
      p.particle === null ? (obj.cells.get(p.key) as Cell) : { glyph: p.glyph, fg, bg: null };
    const same = fg === source.fg && p.glyph === source.glyph;
    visit(x, y, same ? source : { ...source, glyph: p.glyph, fg });
  }
}
