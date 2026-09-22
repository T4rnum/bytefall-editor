import { type Animation, frameDocument, withFrameDocument } from './animation';
import { type Cell, cellsEqual, isBlankCell } from './cell';
import { type Document, findLayer, setLayerCells } from './document';
import { type CellEdits, type CellKey, applyEdits } from './grid';

/**
 * Запись истории хранит две чистые функции над состоянием T. Для правок ячеек это патч,
 * память пропорциональна размеру изменения. Для структурных операций это ссылки на старое
 * и новое состояние, что дёшево благодаря неизменяемости.
 */
export interface HistoryEntry<T = Document> {
  readonly label: string;
  readonly apply: (value: T) => T;
  readonly revert: (value: T) => T;
  /**
   * Ключ серии. Записи с одинаковым ключом, идущие подряд, схлопываются в одну: перетаскивание
   * ползунка обновляет документ живьём, но в историю попадает единственный шаг от начала жеста
   * до конца. Ключ должен быть новым на каждый жест, иначе склеятся два разных действия.
   */
  readonly mergeKey?: string;
}

export interface History<T = Document> {
  readonly past: readonly HistoryEntry<T>[];
  readonly future: readonly HistoryEntry<T>[];
  readonly limit: number;
}

export interface CellChange {
  readonly key: CellKey;
  readonly before: Cell | null;
  readonly after: Cell | null;
}

export const DEFAULT_HISTORY_LIMIT = 200;

export function createHistory<T = Document>(limit: number = DEFAULT_HISTORY_LIMIT): History<T> {
  return { past: [], future: [], limit };
}

export function pushEntry<T>(history: History<T>, entry: HistoryEntry<T>): History<T> {
  const last = history.past[history.past.length - 1];
  if (entry.mergeKey !== undefined && last?.mergeKey === entry.mergeKey) {
    // Продолжение серии: новое состояние, но откат по-прежнему к тому, что было до её начала.
    const merged: HistoryEntry<T> = { ...entry, revert: last.revert };
    return { ...history, past: [...history.past.slice(0, -1), merged], future: [] };
  }
  const past = [...history.past, entry];
  return {
    ...history,
    past: past.length > history.limit ? past.slice(-history.limit) : past,
    future: [],
  };
}

export const canUndo = <T>(history: History<T>): boolean => history.past.length > 0;
export const canRedo = <T>(history: History<T>): boolean => history.future.length > 0;

export function undo<T>(history: History<T>, doc: T): { history: History<T>; doc: T } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    history: { ...history, past: history.past.slice(0, -1), future: [entry, ...history.future] },
    doc: entry.revert(doc),
  };
}

export function redo<T>(history: History<T>, doc: T): { history: History<T>; doc: T } | null {
  const [entry, ...future] = history.future;
  if (!entry) return null;
  return { history: { ...history, past: [...history.past, entry], future }, doc: entry.apply(doc) };
}

/** Вычисляет реальные изменения относительно текущего слоя. null, если менять нечего. */
export function cellEditsEntry(
  doc: Document,
  layerId: string,
  edits: CellEdits,
  label: string,
): HistoryEntry<Document> | null {
  const layer = findLayer(doc, layerId);
  if (!layer) return null;
  const changes: CellChange[] = [];
  for (const [key, proposed] of edits) {
    const before = layer.cells.get(key) ?? null;
    const after = isBlankCell(proposed) ? null : proposed;
    if (!cellsEqual(before, after)) changes.push({ key, before, after });
  }
  if (changes.length === 0) return null;

  const patch = (target: Document, pick: 'before' | 'after'): Document => {
    const current = findLayer(target, layerId);
    if (!current) return target;
    const patchEdits = new Map<CellKey, Cell | null>();
    for (const change of changes) patchEdits.set(change.key, change[pick]);
    return setLayerCells(target, layerId, applyEdits(current.cells, patchEdits));
  };
  return { label, apply: (d) => patch(d, 'after'), revert: (d) => patch(d, 'before') };
}

/** Структурная операция: хранит ссылки на оба состояния. */
export function snapshotEntry<T>(
  label: string,
  before: T,
  after: T,
  mergeKey?: string,
): HistoryEntry<T> {
  return { label, apply: () => after, revert: () => before, mergeKey };
}

/** Поднимает запись над документом до записи над анимацией: она применяется к кадру index. */
export function liftToFrame(entry: HistoryEntry<Document>, index: number): HistoryEntry<Animation> {
  const onFrame =
    (step: (doc: Document) => Document) =>
    (anim: Animation): Animation =>
      anim.frames[index] ? withFrameDocument(anim, index, step(frameDocument(anim, index))) : anim;
  return {
    label: entry.label,
    apply: onFrame(entry.apply),
    revert: onFrame(entry.revert),
    mergeKey: entry.mergeKey,
  };
}
