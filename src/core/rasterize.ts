import { type Affine, applyAffine, integerOffset, invertAffine } from './affine';
import type { Cell } from './cell';
import { type Rect, intersectRects, rectContains } from './geometry';
import { type CellKey, KEY_STRIDE, gridBounds, keyOf, xOf, yOf } from './grid';
import type { SceneObject } from './object';

/**
 * Ячейка объекта под центром ячейки документа (x, y). `inverse` — обратная матрица объекта.
 * null, если центр попадает за пределы локальной сетки.
 *
 * Скобки расставлены так же, как в цикле `rasterizeObject`, где вклад строки считается один раз:
 * при другом порядке сложения результат на границе ячеек мог бы разойтись в последнем бите, и
 * пипетка взяла бы не тот символ, что нарисован.
 */
export function sourceKey(inverse: Affine, x: number, y: number): CellKey | null {
  const lx = Math.floor(inverse.a * (x + 0.5) + (inverse.c * (y + 0.5) + inverse.e));
  const ly = Math.floor(inverse.b * (x + 0.5) + (inverse.d * (y + 0.5) + inverse.f));
  if (lx < 0 || ly < 0 || lx >= KEY_STRIDE || ly >= KEY_STRIDE) return null;
  return keyOf(lx, ly);
}

/** Целые ячейки документа, которые может задеть прямоугольник `local` после матрицы. */
export function coveringRect(matrix: Affine, local: Rect): Rect {
  const corners = [
    applyAffine(matrix, local.x, local.y),
    applyAffine(matrix, local.x + local.w, local.y),
    applyAffine(matrix, local.x + local.w, local.y + local.h),
    applyAffine(matrix, local.x, local.y + local.h),
  ];
  const x0 = Math.floor(Math.min(...corners.map((p) => p.x)));
  const y0 = Math.floor(Math.min(...corners.map((p) => p.y)));
  const x1 = Math.ceil(Math.max(...corners.map((p) => p.x)));
  const y1 = Math.ceil(Math.max(...corners.map((p) => p.y)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Объект в ячейки документа: `visit` получает каждую ячейку из `clip`, в которой оказался
 * символ объекта.
 *
 * Ячейка документа берёт ту ячейку объекта, куда при обратном преобразовании попадает её
 * центр, — как пиксели при повороте картинки ближайшим соседом. Поэтому результат однозначен:
 * у каждой ячейки ровно один источник, дыр и наложений внутри объекта не бывает, а сдвиг на
 * целое и поворот на прямой угол переставляют ячейки без потерь. Правки отдельных символов
 * сюда не входят: они меняют, как символ нарисован, а не в какой он ячейке (DESIGN.md, раздел 2).
 *
 * Это та же раскладка, что видна на экране: квадраты символов без правок укладываются вплотную,
 * и центр ячейки попадает ровно в один из них.
 */
export function rasterizeObject(
  obj: SceneObject,
  matrix: Affine,
  clip: Rect,
  visit: (x: number, y: number, cell: Cell) => void,
): void {
  const offset = integerOffset(matrix);
  if (offset) {
    for (const [key, cell] of obj.cells) {
      const x = xOf(key) + offset.x;
      const y = yOf(key) + offset.y;
      if (rectContains(clip, x, y)) visit(x, y, cell);
    }
    return;
  }
  const inverse = invertAffine(matrix);
  const bounds = gridBounds(obj.cells);
  if (!inverse || !bounds) return;
  const box = intersectRects(coveringRect(matrix, bounds), clip);
  if (!box) return;
  const { a, b, c, d, e, f } = inverse;
  const right = bounds.x + bounds.w;
  const bottom = bounds.y + bounds.h;
  for (let y = box.y; y < box.y + box.h; y++) {
    // Вклад строки один на всю строку; формула та же, что в sourceKey.
    const rowX = c * (y + 0.5) + e;
    const rowY = d * (y + 0.5) + f;
    for (let x = box.x; x < box.x + box.w; x++) {
      const lx = Math.floor(a * (x + 0.5) + rowX);
      const ly = Math.floor(b * (x + 0.5) + rowY);
      // Угол повёрнутой рамки пуст: туда незачем ходить в Map.
      if (lx < bounds.x || ly < bounds.y || lx >= right || ly >= bottom) continue;
      // Ключ как в keyOf: рамка объекта уже гарантирует допустимые координаты.
      const cell = obj.cells.get(ly * KEY_STRIDE + lx);
      if (cell) visit(x, y, cell);
    }
  }
}
