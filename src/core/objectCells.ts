import type { Affine } from './affine';
import type { Cell } from './cell';
import { type CellBuffer, blendAt } from './cellBuffer';
import { rasterizeDeformed } from './deformObject';
import { lookCell, tintOf } from './look';
import type { SceneObject } from './object';
import { rasterizeObject } from './rasterize';

/*
 * Объекты в ячейки буфера: так они уходят в текст, миниатюры и плоский кадр. `wanted` отсекает
 * ячейки вне пересобираемых тайлов.
 */

/**
 * Объект в буфер по ячейкам. Свободный объект — повёрнутый, отмасштабированный — попадает в
 * ячейки так же, как в текст и при впечатывании в слой: через `rasterizeObject`.
 */
export function blendObject(
  buf: CellBuffer,
  obj: SceneObject,
  matrix: Affine,
  opacity: number,
  wanted: (x: number, y: number) => boolean,
): void {
  const canvas = { x: 0, y: 0, w: buf.width, h: buf.height };
  const alpha = opacity * obj.opacity;
  const tint = tintOf(obj);
  // Оттенок бывает только у объектов: смешивание растра, горячий путь, о нём не знает.
  rasterizeObject(obj, matrix, canvas, (x, y, cell) => {
    if (wanted(x, y)) blendAt(buf, x, y, tint ? lookCell(cell, tint, 1) : cell, alpha);
  });
}

/** Деформированный объект в буфер по ячейкам — так он уходит в текст и миниатюры. */
export function blendDeformed(
  buf: CellBuffer,
  obj: SceneObject,
  matrix: Affine,
  opacity: number,
  wanted: (x: number, y: number) => boolean,
  time: number,
  rig?: ReadonlyMap<string, Affine>,
): void {
  const canvas = { x: 0, y: 0, w: buf.width, h: buf.height };
  const alpha = opacity * obj.opacity;
  const tint = tintOf(obj);
  const visit = (x: number, y: number, cell: Cell): void => {
    if (wanted(x, y)) blendAt(buf, x, y, tint ? lookCell(cell, tint, 1) : cell, alpha);
  };
  rasterizeDeformed(obj, matrix, time, canvas, visit, rig);
}
