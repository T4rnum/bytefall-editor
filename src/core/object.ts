import type { CellAttrValue } from './cell';
import { type Document, canEditLayer, findLayer, newId } from './document';
import { type CellGrid, emptyGrid } from './grid';
import {
  type GlyphOverrides,
  type Transform2D,
  centerPivot,
  createTransform,
  emptyOverrides,
  normalizeTransform,
  pruneOverrides,
  sameTransform,
} from './transform';

export type PropValue = CellAttrValue;
/** Произвольные свойства объекта: задел под логику, связи и анимацию. */
export type ObjectProps = Readonly<Record<string, PropValue>>;

/**
 * Объект: именованный набор ячеек с трансформом, живущий поверх растра своего слоя.
 * Слои остаются растровыми контейнерами, как в Photoshop, объекты живут поверх, как в Blender.
 */
export interface SceneObject {
  readonly id: string;
  readonly name: string;
  readonly layerId: string;
  /** Родитель: трансформ объекта задан относительно него. null — объект в корне. */
  readonly parentId: string | null;
  /** Домашняя ячейка, поворот, масштаб, опорная точка. Позиция может выходить за холст. */
  readonly transform: Transform2D;
  readonly visible: boolean;
  readonly locked: boolean;
  /** Непрозрачность всего объекта, 0..1. Умножается на непрозрачность слоя. */
  readonly opacity: number;
  /**
   * Оттенок: цвет, к которому смешиваются цвета символов, сила — в альфе (`#rrggbbaa`).
   * null — без оттенка. Непрозрачность и оттенок детям не передаются, как и в Blender.
   */
  readonly tint: string | null;
  /** Ячейки в локальных координатах от (0, 0). */
  readonly cells: CellGrid;
  /** Поворот, размер и сдвиг отдельных символов. Разреженные: только то, что правили руками. */
  readonly overrides: GlyphOverrides;
  readonly props: ObjectProps;
}

export const MAX_OBJECTS = 1024;

export interface CreateObjectInit {
  readonly name: string;
  readonly layerId: string;
  readonly x: number;
  readonly y: number;
  readonly cells?: CellGrid;
  readonly props?: ObjectProps;
  readonly id?: string;
}

/** Новый объект без поворота и масштаба, опорная точка — в центре содержимого. */
export function createObject(init: CreateObjectInit): SceneObject {
  const cells = init.cells ?? emptyGrid();
  return {
    id: init.id ?? newId('object'),
    name: init.name,
    layerId: init.layerId,
    parentId: null,
    transform: createTransform(init.x, init.y, centerPivot(cells)),
    visible: true,
    locked: false,
    opacity: 1,
    tint: null,
    cells,
    overrides: emptyOverrides(),
    props: init.props ?? {},
  };
}

/** Двигать, крутить и править объект можно, если он не заперт и его слой редактируемый. */
export function canEditObject(doc: Document, obj: SceneObject): boolean {
  return !obj.locked && canEditLayer(findLayer(doc, obj.layerId));
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

/**
 * Убирает объект из списка и больше ничего. Его дети остались бы со ссылкой в никуда, поэтому
 * снаружи зовут `removeObject` из `hierarchy.ts`: там дети переходят к деду.
 */
export function dropObject(doc: Document, id: string): Document {
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
  const next = { ...objects[index], ...patch };
  // Новые ячейки уносят правки символов, которым больше не на что ссылаться.
  objects[index] = patch.cells
    ? { ...next, overrides: pruneOverrides(next.overrides, next.cells) }
    : next;
  return { ...doc, objects };
}

/**
 * Меняет поля трансформа и приводит его к пределам формата. Если после этого ничего не
 * поменялось, возвращает тот же документ: щелчок по ручке без движения не должен становиться
 * записью истории.
 */
export function transformObject(doc: Document, id: string, patch: Partial<Transform2D>): Document {
  const obj = findObject(doc, id);
  if (!obj) return doc;
  const transform = normalizeTransform({ ...obj.transform, ...patch });
  if (sameTransform(transform, obj.transform)) return doc;
  return updateObject(doc, id, { transform });
}

/** Переносит домашнюю ячейку на целое число ячеек. */
export function moveObject(doc: Document, id: string, dx: number, dy: number): Document {
  const obj = findObject(doc, id);
  if (!obj) return doc;
  return transformObject(doc, id, { x: obj.transform.x + dx, y: obj.transform.y + dy });
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
  const { x, y } = source.transform;
  const copy: SceneObject = {
    ...source,
    id: newId('object'),
    name: `${source.name} copy`,
    transform: normalizeTransform({ ...source.transform, x: x + dx, y: y + dy }),
  };
  return addObject(doc, copy, index + 1);
}

/**
 * Копия объекта для вставки. Место то же: объект, перенесённый в соседний кадр, должен встать
 * ровно туда, где был, иначе анимация дёрнется. Слой — тот, на который вставляют.
 *
 * Идентификатор сохраняется, если в кадре такого ещё нет: так один и тот же объект в разных
 * кадрах остаётся одним объектом, как и при дублировании кадра. Иначе объект получает новый.
 * Скрытость и запрет правки не переносятся: только что вставленный объект должен быть виден
 * и сразу двигаться.
 */
export function pasteObject(
  doc: Document,
  source: SceneObject,
  layerId: string,
): { doc: Document; object: SceneObject } {
  const object: SceneObject = {
    ...source,
    id: findObject(doc, source.id) ? newId('object') : source.id,
    layerId,
    visible: true,
    locked: false,
  };
  return { doc: addObject(doc, object), object };
}

/**
 * Переносит объект на другой слой и кладёт поверх объектов этого слоя: перенос — это жест
 * «положить сюда», и объект не должен теряться под теми, что на слое уже лежат.
 */
export function moveObjectToLayer(doc: Document, id: string, layerId: string): Document {
  const index = objectIndex(doc, id);
  if (index === -1 || doc.objects[index].layerId === layerId) return doc;
  if (!findLayer(doc, layerId)) throw new Error(`Unknown layer: ${layerId}`);
  const moved = { ...doc.objects[index], layerId };
  return { ...doc, objects: [...doc.objects.filter((_, i) => i !== index), moved] };
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
