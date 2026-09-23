import { type Affine, applyAffine, decomposeAffine, invertAffine, multiply } from './affine';
import { type Document, removeLayer } from './document';
import {
  type SceneObject,
  dropObject,
  findObject,
  moveObject,
  objectsInVisualOrder,
  transformObject,
  updateObject,
} from './object';
import { objectMatrices } from './placement';
import { type Transform2D, normalizeTransform } from './transform';

/**
 * Иерархия объектов: трансформ ребёнка задан относительно родителя, поэтому родителя можно
 * двигать и крутить вместе со всеми детьми. Список плоский, у объекта только `parentId`
 * (DESIGN.md, раздел 3): так проще формат, дифф и история.
 */

/** Все потомки объекта: дети, их дети и дальше. */
export function descendantIds(doc: Document, id: string): Set<string> {
  const found = new Set<string>();
  let frontier = [id];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const obj of doc.objects) {
      if (obj.parentId !== null && frontier.includes(obj.parentId) && !found.has(obj.id)) {
        found.add(obj.id);
        next.push(obj.id);
      }
    }
    frontier = next;
  }
  return found;
}

/** Родителем может стать любой другой объект кадра, кроме самого объекта и его потомков. */
export function canSetParent(doc: Document, childId: string, parentId: string): boolean {
  if (childId === parentId || !findObject(doc, childId) || !findObject(doc, parentId)) return false;
  return !descendantIds(doc, childId).has(parentId);
}

/**
 * Трансформ, с которым объект встанет туда, куда его ставит матрица мира `world`, под родителем
 * с матрицей `parentWorld` (null — объект в корне). Опора остаётся прежней и встаёт точно на своё
 * место. Поворот и масштаб берутся из разложения матрицы. Под родителем с неравным масштабом по
 * осям, повёрнутым относительно ребёнка, у ребёнка появился бы перекос, а в трансформе его нет:
 * тогда объект чуть искажается вдали от опоры. Под равномерно отмасштабированным родителем
 * перенос точный.
 */
export function transformForWorld(
  t: Transform2D,
  world: Affine,
  parentWorld: Affine | null,
): Transform2D {
  const inverse = parentWorld ? invertAffine(parentWorld) : null;
  const local = inverse ? multiply(inverse, world) : world;
  const { rot, sx, sy } = decomposeAffine(local);
  const deg = (rot * 180) / Math.PI;
  // Опора встаёт ровно туда же, куда её ставит local: при перекосе ошибка остаётся только
  // вдали от неё, а не по всему объекту.
  const at = applyAffine(local, t.px, t.py);
  const hx = at.x - t.px;
  const hy = at.y - t.py;
  const x = Math.round(hx);
  const y = Math.round(hy);
  return normalizeTransform({ ...t, rot: deg, sx, sy, x, y, dx: hx - x, dy: hy - y });
}

/**
 * Назначает объекту родителя, не сдвигая объект на экране: локальный трансформ пересчитывается
 * так, чтобы матрица мира осталась прежней. null отвязывает объект. Родитель, который замкнул
 * бы цепочку, не назначается.
 */
export function setParent(doc: Document, childId: string, parentId: string | null): Document {
  const child = findObject(doc, childId);
  if (!child || child.parentId === parentId) return doc;
  if (parentId !== null && !canSetParent(doc, childId, parentId)) return doc;
  const matrices = objectMatrices(doc);
  const world = matrices.get(childId) as Affine;
  const parentWorld = parentId === null ? null : (matrices.get(parentId) as Affine);
  const transform = transformForWorld(child.transform, world, parentWorld);
  return updateObject(doc, childId, { parentId, transform });
}

/**
 * Сдвигает объект на (dx, dy) ячеек документа. У объекта в корне это просто новая домашняя
 * ячейка. У ребёнка повёрнутого или отмасштабированного родителя позиция задана в осях родителя:
 * сдвиг переводится в них, целая часть уходит в домашнюю ячейку, дробная — в смещение. Так объект
 * под курсором едет за курсором, а не вдоль повёрнутых осей.
 */
export function moveInDocument(doc: Document, id: string, dx: number, dy: number): Document {
  const obj = findObject(doc, id);
  if (!obj) return doc;
  const parent = obj.parentId === null ? undefined : findObject(doc, obj.parentId);
  const pw = parent ? objectMatrices(doc).get(parent.id) : undefined;
  if (!pw || (pw.a === 1 && pw.b === 0 && pw.c === 0 && pw.d === 1)) {
    return moveObject(doc, id, dx, dy);
  }
  const inverse = invertAffine(pw);
  if (!inverse) return doc;
  const t = obj.transform;
  const hx = t.x + t.dx + (inverse.a * dx + inverse.c * dy);
  const hy = t.y + t.dy + (inverse.b * dx + inverse.d * dy);
  const x = Math.round(hx);
  const y = Math.round(hy);
  return transformObject(doc, id, { x, y, dx: hx - x, dy: hy - y });
}

/** Отдаёт детей удаляемых объектов ближайшему уцелевшему предку, не сдвигая их на экране. */
function adoptOrphans(doc: Document, removed: ReadonlySet<string>): Document {
  let next = doc;
  for (const obj of doc.objects) {
    if (removed.has(obj.id) || obj.parentId === null || !removed.has(obj.parentId)) continue;
    let heir: SceneObject | undefined = findObject(doc, obj.parentId);
    while (heir && removed.has(heir.id)) {
      heir = heir.parentId === null ? undefined : findObject(doc, heir.parentId);
    }
    next = setParent(next, obj.id, heir ? heir.id : null);
  }
  return next;
}

/** Удаляет объект; его дети переходят к его родителю и остаются на месте. */
export function removeObject(doc: Document, id: string): Document {
  if (!findObject(doc, id)) return doc;
  return dropObject(adoptOrphans(doc, new Set([id])), id);
}

/** Удаляет слой с его объектами; дети этих объектов с других слоёв остаются на месте. */
export function removeLayerKeepingChildren(doc: Document, layerId: string): Document {
  const removed = new Set(doc.objects.filter((o) => o.layerId === layerId).map((o) => o.id));
  return removeLayer(removed.size > 0 ? adoptOrphans(doc, removed) : doc, layerId);
}

/**
 * Копия объекта вне иерархии: без родителя, с трансформом, который ставит её туда же, где объект
 * сейчас на экране. Так объект уходит в буфер обмена: в другом кадре его родителя может не быть.
 */
export function detachedCopy(doc: Document, obj: SceneObject): SceneObject {
  if (obj.parentId === null) return obj;
  const world = objectMatrices(doc).get(obj.id) as Affine;
  return { ...obj, parentId: null, transform: transformForWorld(obj.transform, world, null) };
}

export interface OutlineRow {
  readonly object: SceneObject;
  /** Глубина в иерархии: 0 у объекта без родителя. */
  readonly depth: number;
}

/**
 * Объекты деревом для панели: сверху то, что нарисовано выше, под каждым объектом — его дети.
 * Ребёнок может лежать на другом слое, чем родитель, поэтому это не порядок отрисовки, а
 * порядок родства. Объект с пропавшим родителем показывается как корень.
 */
export function objectOutline(doc: Document): OutlineRow[] {
  const topDown = objectsInVisualOrder(doc).reverse();
  const ids = new Set(topDown.map((o) => o.id));
  const children = new Map<string, SceneObject[]>();
  const roots: SceneObject[] = [];
  for (const obj of topDown) {
    if (obj.parentId !== null && ids.has(obj.parentId)) {
      const list = children.get(obj.parentId);
      if (list) list.push(obj);
      else children.set(obj.parentId, [obj]);
    } else {
      roots.push(obj);
    }
  }
  const rows: OutlineRow[] = [];
  const seen = new Set<string>();
  const visit = (obj: SceneObject, depth: number): void => {
    if (seen.has(obj.id)) return;
    seen.add(obj.id);
    rows.push({ object: obj, depth });
    for (const child of children.get(obj.id) ?? []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  // Замкнутую цепочку из корня не достать: такие объекты всё равно должны быть в списке.
  for (const obj of topDown) visit(obj, 0);
  return rows;
}
