import type { Cell } from './cell';
import { type Rgba, tintColor, toHex, withAlpha } from './color';
import { colorOf } from './cellBuffer';
import type { SceneObject } from './object';

/**
 * Вид объекта целиком: непрозрачность и оттенок. Они меняют цвета символов, а не то, какие
 * символы в каких ячейках, поэтому применяются там, где цвет уходит в кадр.
 */

/** Оттенок объекта или null, если он ничего не меняет. */
export function tintOf(obj: SceneObject): Rgba | null {
  if (obj.tint === null) return null;
  const tint = colorOf(obj.tint);
  return tint.a > 0 ? tint : null;
}

/**
 * Ячейка объекта с его видом — для слоя с эффектами: там объект смешивается в общую сетку, и
 * цвет нужен строкой. Цвет округляется до восьми бит, как любой цвет в документе.
 */
export function lookCell(cell: Cell, tint: Rgba | null, opacity: number): Cell {
  if (!tint && opacity >= 1) return cell;
  const paint = (hex: string): string => toHex(withAlpha(tintColor(colorOf(hex), tint), opacity));
  return { ...cell, fg: paint(cell.fg), bg: cell.bg === null ? null : paint(cell.bg) };
}
