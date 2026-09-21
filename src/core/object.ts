import type { Cell, CellAttrValue } from './cell';
import { type Document, findLayer, newId, setLayerCells } from './document';
import { type Rect, inBounds, rectContains } from './geometry';
import {
  type CellGrid,
  type CellKey,
  applyEdits,
  emptyGrid,
  gridBounds,
  keyOf,
  xOf,
  yOf,
} from './grid';
import { clearRectEdits, copyRect } from './selection';

export type PropValue = CellAttrValue;
/** Произвольные свойства объекта: задел под логику, связи и анимацию. */
export type ObjectProps = Readonly<Record<string, PropValue>>;

/**
 * Объект: именованный набор ячеек с позицией, живущий поверх растра своего слоя.
 * Слои остаются растровыми контейнерами, как в Photoshop, объекты живут поверх, как в Blender.
 */
export interface SceneObject {
  readonly id: string;
  readonly name: string;
  readonly layerId: string;
  /** Левый верхний угол в координатах документа. Может выходить за холст, в том числе в минус. */
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly locked: boolean;
  /** Ячейки в локальных координатах от (0, 0). */
  readonly cells: CellGrid;
  readonly props: ObjectProps;
}

export const MAX_OBJECTS = 1024;
const LOCAL_LIMIT = 65536;

export interface CreateObjectInit {
  readonly name: string;
  readonly layerId: string;
  readonly x: number;
  readonly y: number;
  readonly cells?: CellGrid;
  readonly props?: ObjectProps;
  readonly id?: string;
}

export function createObject(init: CreateObjectInit): SceneObject {
  return {
    id: init.id ?? newId('object'),
    name: init.name,
    layerId: init.layerId,
    x: init.x,
    y: init.y,
    visible: true,
    locked: false,
    cells: init.cells ?? emptyGrid(),
    props: init.props ?? {},
  };
}

export function findObject(doc: Document, id: string): SceneObject | undefined {
  return doc.objects.find((o) => o.id === id);
}

export function objectIndex(doc: Document, id: string): number {
  return doc.objects.findIndex((o) => o.id === id);
}

/** Объекты слоя в порядке отрисовки, снизу вверх. */
export function groupObjectsByLayer(doc: Document): ReadonlyMap<string, readonly SceneObject[]> {
  const groups = new Map<string, SceneObject[]>();
  for (const obj of doc.objects) {
    const list = groups.get(obj.layerId);
    if (list) list.push(obj);
    else groups.set(obj.layerId, [obj]);
  }
  return groups;
}

/** Все объекты в визуальном порядке: сначала по слоям снизу вверх, внутри слоя по порядку массива. */
export function objectsInVisualOrder(doc: Document): SceneObject[] {
  const groups = groupObjectsByLayer(doc);
  return doc.layers.flatMap((layer) => groups.get(layer.id) ?? []);
}

export function addObject(
  doc: Document,
  obj: SceneObject,
  index: number = doc.objects.length,
): Document {
  if (findObject(doc, obj.id)) throw new Error(`Duplicate object id: ${obj.id}`);
  if (!findLayer(doc, obj.layerId)) throw new Error(`Unknown layer: ${obj.layerId}`);
  if (doc.objects.length >= MAX_OBJECTS) throw new Error(`At most ${MAX_OBJECTS} objects`);
  const objects = doc.objects.slice();
  objects.splice(Math.max(0, Math.min(index, objects.length)), 0, obj);
  return { ...doc, objects };
}

export function removeObject(doc: Document, id: string): Document {
  const objects = doc.objects.filter((o) => o.id !== id);
  return objects.length === doc.objects.length ? doc : { ...doc, objects };
}

export function updateObject(
  doc: Document,
  id: string,
  patch: Partial<Omit<SceneObject, 'id'>>,
): Document {
  const index = objectIndex(doc, id);
  if (index === -1) return doc;
  if (patch.layerId !== undefined && !findLayer(doc, patch.layerId)) {
    throw new Error(`Unknown layer: ${patch.layerId}`);
  }
  const objects = doc.objects.slice();
  objects[index] = { ...objects[index], ...patch };
  return { ...doc, objects };
}

/**
 * Сдвигает объект на шаг внутри его слоя: delta > 0 выше, delta < 0 ниже. Объекты других слоёв
 * пропускаются, крайний объект остаётся на месте и документ не меняется.
 */
export function shiftObjectOrder(doc: Document, id: string, delta: number): Document {
  const index = objectIndex(doc, id);
  if (index === -1 || delta === 0) return doc;
  const layerId = doc.objects[index].layerId;
  const siblings = doc.objects
    .map((o, i) => (o.layerId === layerId ? i : -1))
    .filter((i) => i !== -1);
  const target = siblings[siblings.indexOf(index) + Math.sign(delta)];
  if (target === undefined) return doc;
  const objects = doc.objects.slice();
  [objects[index], objects[target]] = [objects[target], objects[index]];
  return { ...doc, objects };
}

export function duplicateObject(doc: Document, id: string, dx = 1, dy = 1): Document {
  const index = objectIndex(doc, id);
  if (index === -1) return doc;
  const source = doc.objects[index];
  const copy: SceneObject = {
    ...source,
    id: newId('object'),
    name: `${source.name} copy`,
    x: source.x + dx,
    y: source.y + dy,
  };
  return addObject(doc, copy, index + 1);
}

/** Ограничивающий прямоугольник в координатах документа. Пустой объект занимает одну ячейку. */
export function objectBounds(obj: SceneObject): Rect {
  const bounds = gridBounds(obj.cells);
  if (!bounds) return { x: obj.x, y: obj.y, w: 1, h: 1 };
  return { x: obj.x + bounds.x, y: obj.y + bounds.y, w: bounds.w, h: bounds.h };
}

export function objectCellAt(obj: SceneObject, x: number, y: number): Cell | undefined {
  const lx = x - obj.x;
  const ly = y - obj.y;
  if (lx < 0 || ly < 0 || lx >= LOCAL_LIMIT || ly >= LOCAL_LIMIT) return undefined;
  return obj.cells.get(keyOf(lx, ly));
}

function isLayerShown(doc: Document, layerId: string): boolean {
  const layer = findLayer(doc, layerId);
  return layer !== undefined && layer.visible && layer.opacity > 0;
}

/** Верхний видимый объект под ячейкой: сначала по непустой ячейке, затем по рамке. */
export function objectAt(doc: Document, x: number, y: number): SceneObject | undefined {
  const candidates = objectsInVisualOrder(doc)
    .filter((o) => o.visible && isLayerShown(doc, o.layerId))
    .reverse();
  return (
    candidates.find((o) => objectCellAt(o, x, y) !== undefined) ??
    candidates.find((o) => rectContains(objectBounds(o), x, y))
  );
}

/** Верхняя видимая ячейка под координатой с учётом объектов и растров всех слоёв. */
export function topCellAt(doc: Document, x: number, y: number): Cell | undefined {
  if (!inBounds(x, y, doc.width, doc.height)) return undefined;
  const groups = groupObjectsByLayer(doc);
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i];
    if (!layer.visible || layer.opacity <= 0) continue;
    const objects = groups.get(layer.id) ?? [];
    for (let j = objects.length - 1; j >= 0; j--) {
      if (!objects[j].visible) continue;
      const cell = objectCellAt(objects[j], x, y);
      if (cell) return cell;
    }
    const cell = layer.cells.get(keyOf(x, y));
    if (cell) return cell;
  }
  return undefined;
}

/** Вырезает ячейки прямоугольника из растра слоя в новый объект. null, если в области пусто. */
export function groupSelection(
  doc: Document,
  layerId: string,
  rect: Rect,
  name: string = `Object ${doc.objects.length + 1}`,
): { doc: Document; object: SceneObject } | null {
  const layer = findLayer(doc, layerId);
  if (!layer) return null;
  const clip = copyRect(layer.cells, rect);
  if (clip.cells.size === 0) return null;
  const object = createObject({ name, layerId, x: rect.x, y: rect.y, cells: clip.cells });
  const raster = applyEdits(layer.cells, clearRectEdits(layer.cells, rect));
  return { doc: addObject(setLayerCells(doc, layerId, raster), object), object };
}

/** Впечатывает объект в растр его слоя и удаляет объект. Ячейки за холстом теряются. */
export function ungroupObject(doc: Document, id: string): Document {
  const obj = findObject(doc, id);
  if (!obj) return doc;
  const layer = findLayer(doc, obj.layerId);
  if (!layer) return removeObject(doc, id);
  const edits = new Map<CellKey, Cell | null>();
  for (const [key, cell] of obj.cells) {
    const x = obj.x + xOf(key);
    const y = obj.y + yOf(key);
    if (inBounds(x, y, doc.width, doc.height)) edits.set(keyOf(x, y), cell);
  }
  const baked = setLayerCells(doc, obj.layerId, applyEdits(layer.cells, edits));
  return removeObject(baked, id);
}

export function setObjectProp(doc: Document, id: string, key: string, value: PropValue): Document {
  const obj = findObject(doc, id);
  if (!obj) return doc;
  return updateObject(doc, id, { props: { ...obj.props, [key]: value } });
}

export function removeObjectProp(doc: Document, id: string, key: string): Document {
  const obj = findObject(doc, id);
  if (!obj || !(key in obj.props)) return doc;
  const props = Object.fromEntries(Object.entries(obj.props).filter(([k]) => k !== key));
  return updateObject(doc, id, { props });
}
