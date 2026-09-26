import type { Document } from './document';
import { descendantIds } from './hierarchy';

/**
 * Выбор нескольких объектов. Порядок — порядок выбора, последний — главный: его показывает
 * инспектор и у него ручки трансформа. Групповые операции идут по всем.
 */

/** Ctrl и Shift по объекту на холсте: был в выборе — уходит, не был — становится главным. */
export function toggleInSelection(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/**
 * Shift по строке панели: всё от главного до щёлкнутого в порядке списка, щёлкнутый — главный.
 * Без главного — один щёлкнутый.
 */
export function rangeSelection(
  order: readonly string[],
  from: string | null,
  to: string,
): string[] {
  const a = from === null ? -1 : order.indexOf(from);
  const b = order.indexOf(to);
  if (a === -1 || b === -1) return [to];
  const range = a <= b ? order.slice(a, b + 1) : order.slice(b, a + 1).reverse();
  return [...range.filter((id) => id !== to), to];
}

/**
 * Выбранные без тех, чей предок тоже выбран: предок и так везёт потомка, и перенос обоих сдвинул
 * бы потомка дважды.
 */
export function selectionRoots(doc: Document, ids: readonly string[]): string[] {
  const covered = new Set<string>();
  for (const id of ids) for (const d of descendantIds(doc, id)) covered.add(d);
  return ids.filter((id) => !covered.has(id));
}

/** Выбор без объектов, которых в документе больше нет: после отмены или удаления слоя. */
export function existingSelection(doc: Document, ids: readonly string[]): string[] {
  const alive = new Set(doc.objects.map((o) => o.id));
  return ids.filter((id) => alive.has(id));
}
