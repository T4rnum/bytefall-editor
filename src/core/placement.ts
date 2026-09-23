import { type Affine, applyAffine, integerOffset, invertAffine, multiply } from './affine';
import type { Cell } from './cell';
import type { Document, Layer } from './document';
import { hasActiveEffects } from './effects';
import { type Point, type Rect, inBounds } from './geometry';
import { gridBounds, keyOf } from './grid';
import { type SceneObject, groupObjectsByLayer } from './object';
import { coveringRect, sourceKey } from './rasterize';
import { transformMatrix } from './transform';

/** Документ неизменяем, поэтому массив объектов — надёжный ключ кэша матриц. */
const matrixCache = new WeakMap<readonly SceneObject[], ReadonlyMap<string, Affine>>();

/**
 * Матрицы всех объектов из локальных координат в координаты документа, с учётом родителей:
 * трансформ ребёнка задан относительно родителя. Пропавший родитель и цикл считаются корнем:
 * файл недоверенный, и падать на нём нельзя.
 */
export function objectMatrices(doc: Document): ReadonlyMap<string, Affine> {
  const cached = matrixCache.get(doc.objects);
  if (cached) return cached;
  const byId = new Map(doc.objects.map((o) => [o.id, o]));
  const out = new Map<string, Affine>();
  const visiting = new Set<string>();
  const resolve = (obj: SceneObject): Affine => {
    const known = out.get(obj.id);
    if (known) return known;
    visiting.add(obj.id);
    const local = transformMatrix(obj.transform);
    const parent = obj.parentId === null ? undefined : byId.get(obj.parentId);
    const world = parent && !visiting.has(parent.id) ? multiply(resolve(parent), local) : local;
    visiting.delete(obj.id);
    out.set(obj.id, world);
    return world;
  };
  for (const obj of doc.objects) resolve(obj);
  matrixCache.set(doc.objects, out);
  return out;
}

export function objectMatrix(doc: Document, obj: SceneObject): Affine {
  return objectMatrices(doc).get(obj.id) ?? transformMatrix(obj.transform);
}

/**
 * Объект рисуется прямо в сетку слоя, если он сдвинут на целое число ячеек и его символы
 * не правили. Такой объект ничем не отличается от растра. Остальные — свободные: у них
 * поворот, масштаб, дробный сдвиг или правки отдельных символов.
 */
export function isFreeObject(obj: SceneObject, matrix: Affine): boolean {
  return obj.overrides.size > 0 || integerOffset(matrix) === null;
}

/**
 * Порядок отрисовки объектов слоя снизу вверх. Обычно это порядок массива. На слое с
 * эффектами свободные объекты рисуются поверх результата эффектов: эффект работает с сеткой,
 * а у повёрнутого символа нет ячейки, в которой его можно было бы поджечь.
 */
export function layerDrawOrder(
  layer: Layer,
  objects: readonly SceneObject[],
  matrices: ReadonlyMap<string, Affine>,
): readonly SceneObject[] {
  if (!hasActiveEffects(layer.effects)) return objects;
  const free = (o: SceneObject): boolean => isFreeObject(o, matrices.get(o.id) as Affine);
  return [...objects.filter((o) => !free(o)), ...objects.filter(free)];
}

/** Содержимое объекта в локальных координатах. Пустой объект занимает одну ячейку. */
function localBounds(obj: SceneObject): Rect {
  return gridBounds(obj.cells) ?? { x: 0, y: 0, w: 1, h: 1 };
}

/** Углы содержимого объекта в координатах документа, по часовой стрелке от левого верхнего. */
export function objectQuad(obj: SceneObject, matrix: Affine): readonly Point[] {
  const b = localBounds(obj);
  return [
    applyAffine(matrix, b.x, b.y),
    applyAffine(matrix, b.x + b.w, b.y),
    applyAffine(matrix, b.x + b.w, b.y + b.h),
    applyAffine(matrix, b.x, b.y + b.h),
  ];
}

/** Целые ячейки документа, накрывающие объект целиком. */
export function objectBounds(obj: SceneObject, matrix: Affine): Rect {
  return coveringRect(matrix, localBounds(obj));
}

/** Ячейка объекта, видимая в ячейке документа (x, y): та же, что даёт растеризация. */
export function objectCellAt(
  obj: SceneObject,
  matrix: Affine,
  x: number,
  y: number,
): Cell | undefined {
  const inverse = invertAffine(matrix);
  const key = inverse ? sourceKey(inverse, x, y) : null;
  return key === null ? undefined : obj.cells.get(key);
}

/** Центр ячейки документа внутри рамки содержимого объекта. */
function insideFrame(obj: SceneObject, matrix: Affine, x: number, y: number): boolean {
  const inverse = invertAffine(matrix);
  if (!inverse) return false;
  const p = applyAffine(inverse, x + 0.5, y + 0.5);
  const b = localBounds(obj);
  return p.x >= b.x && p.y >= b.y && p.x < b.x + b.w && p.y < b.y + b.h;
}

const isLayerShown = (layer: Layer): boolean => layer.visible && layer.opacity > 0;

/** Видимые объекты сверху вниз, в том порядке, в каком их перекрывает картинка. */
function objectsTopDown(doc: Document): SceneObject[] {
  const groups = groupObjectsByLayer(doc);
  const matrices = objectMatrices(doc);
  const out: SceneObject[] = [];
  for (const layer of doc.layers) {
    if (!isLayerShown(layer)) continue;
    const objects = layerDrawOrder(layer, groups.get(layer.id) ?? [], matrices);
    out.push(...objects.filter((o) => o.visible));
  }
  return out.reverse();
}

/** Верхний видимый объект под ячейкой: сначала по непустой ячейке, затем по рамке. */
export function objectAt(doc: Document, x: number, y: number): SceneObject | undefined {
  const matrices = objectMatrices(doc);
  const candidates = objectsTopDown(doc);
  const matrix = (o: SceneObject): Affine => matrices.get(o.id) as Affine;
  return (
    candidates.find((o) => objectCellAt(o, matrix(o), x, y) !== undefined) ??
    candidates.find((o) => insideFrame(o, matrix(o), x, y))
  );
}

/** Верхняя видимая ячейка под координатой с учётом объектов и растров всех слоёв. */
export function topCellAt(doc: Document, x: number, y: number): Cell | undefined {
  if (!inBounds(x, y, doc.width, doc.height)) return undefined;
  const groups = groupObjectsByLayer(doc);
  const matrices = objectMatrices(doc);
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i];
    if (!isLayerShown(layer)) continue;
    const objects = layerDrawOrder(layer, groups.get(layer.id) ?? [], matrices);
    for (let j = objects.length - 1; j >= 0; j--) {
      if (!objects[j].visible) continue;
      const cell = objectCellAt(objects[j], matrices.get(objects[j].id) as Affine, x, y);
      if (cell) return cell;
    }
    const cell = layer.cells.get(keyOf(x, y));
    if (cell) return cell;
  }
  return undefined;
}
