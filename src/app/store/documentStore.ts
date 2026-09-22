import { create } from 'zustand';
import {
  type Animation,
  clampFrameIndex,
  createAnimation,
  frameDocument,
  withFrameDocument,
} from '../../core/animation';
import {
  type Document,
  type Layer,
  canEditLayer,
  createDocument,
  findLayer,
} from '../../core/document';
import type { CellEdits, CellKey } from '../../core/grid';
import {
  type History,
  type HistoryEntry,
  cellEditsEntry,
  createHistory,
  liftToFrame,
  pushEntry,
  redo as redoHistory,
  snapshotEntry,
  undo as undoHistory,
} from '../../core/history';

export interface FileRef {
  readonly name: string | null;
  readonly handle: FileSystemFileHandle | null;
}

/** Состояние, которым оперирует история: анимация и кадр, на котором стоял пользователь. */
export interface Checkpoint {
  readonly animation: Animation;
  readonly frameIndex: number;
}

export interface DocumentState {
  readonly animation: Animation;
  readonly frameIndex: number;
  /** Текущий кадр как документ. Пересчитывается при каждой смене анимации или кадра. */
  readonly doc: Document;
  readonly history: History<Checkpoint>;
  readonly activeLayerId: string;
  readonly dirty: boolean;
  readonly file: FileRef;
  /** Растёт при каждой замене анимации: вьюпорт по нему переустанавливает камеру. */
  readonly epoch: number;
  /**
   * Ячейки, изменённые последним коммитом. null означает, что изменилось неизвестно что и кадр
   * надо пересобрать целиком. Не часть документа: в файл не сохраняется и в историю не попадает.
   */
  readonly dirtyKeys: readonly CellKey[] | null;

  /**
   * Заменяет анимацию целиком, с чистой историей. `dirty` нужен восстановлению после аварии:
   * такая работа ни в каком файле не лежит и должна оставаться под защитой до сохранения.
   */
  replaceAnimation: (animation: Animation, file?: FileRef, dirty?: boolean) => void;
  /** Правки ячеек слоя текущего кадра одной записью истории. false, если слой нельзя редактировать. */
  commitCells: (layerId: string, edits: CellEdits, label: string) => boolean;
  /** Структурная операция над текущим кадром: объекты, палитра, имя, фон. */
  commitStructural: (label: string, next: Document) => void;
  /**
   * Операция над всей анимацией: кадры и общие для всех кадров слои. Может сменить текущий кадр.
   * `mergeKey` склеивает подряд идущие записи одной серии, см. `core/history.ts`.
   */
  commitAnimation: (
    label: string,
    next: Animation,
    nextFrameIndex?: number,
    mergeKey?: string,
  ) => void;
  setFrameIndex: (index: number) => void;
  setActiveLayer: (id: string) => void;
  undo: () => void;
  redo: () => void;
  /** Снимает признак изменений только если на диск ушла текущая версия. */
  markSaved: (file: FileRef, saved: Animation) => void;
}

const topLayerId = (doc: Document): string => doc.layers[doc.layers.length - 1].id;

/**
 * Согласованный срез состояния после смены анимации или кадра.
 *
 * `dirtyKeys` по умолчанию null, то есть «изменилось неизвестно что». Только коммит ячеек знает
 * точный список и выставляет его сам; всё остальное — смена кадра, структурная правка, отмена —
 * честно требует полной пересборки.
 */
function derive(animation: Animation, frameIndex: number, activeLayerId: string) {
  const index = clampFrameIndex(animation, frameIndex);
  const doc = frameDocument(animation, index);
  return {
    animation,
    frameIndex: index,
    doc,
    activeLayerId: findLayer(doc, activeLayerId) ? activeLayerId : topLayerId(doc),
    dirtyKeys: null,
  };
}

/** Запись над кадром: после undo и redo пользователь возвращается на кадр правки. */
function frameEntry(entry: HistoryEntry<Animation>, frameIndex: number): HistoryEntry<Checkpoint> {
  return {
    label: entry.label,
    apply: (c) => ({ animation: entry.apply(c.animation), frameIndex }),
    revert: (c) => ({ animation: entry.revert(c.animation), frameIndex }),
  };
}

const initial = createAnimation(createDocument({ name: 'Без названия' }));

export const useDocumentStore = create<DocumentState>((set, get) => ({
  ...derive(initial, 0, ''),
  history: createHistory<Checkpoint>(),
  dirty: false,
  file: { name: null, handle: null },
  epoch: 0,
  dirtyKeys: null,

  replaceAnimation: (animation, file = { name: null, handle: null }, dirty = false) =>
    set((state) => ({
      ...derive(animation, 0, ''),
      history: createHistory<Checkpoint>(),
      dirty,
      file,
      epoch: state.epoch + 1,
    })),

  commitCells: (layerId, edits, label) => {
    const { doc, animation, frameIndex, history, activeLayerId } = get();
    if (!canEditLayer(findLayer(doc, layerId))) return false;
    const entry = cellEditsEntry(doc, layerId, edits, label);
    if (!entry) return true;
    const lifted = liftToFrame(entry, frameIndex);
    set({
      ...derive(lifted.apply(animation), frameIndex, activeLayerId),
      // Коммит знает, какие ячейки тронул: кадр пересоберётся только в их тайлах.
      dirtyKeys: [...edits.keys()],
      history: pushEntry(history, frameEntry(lifted, frameIndex)),
      dirty: true,
    });
    return true;
  },

  commitStructural: (label, next) => {
    const { doc, animation, frameIndex } = get();
    if (next === doc) return;
    get().commitAnimation(label, withFrameDocument(animation, frameIndex, next));
  },

  commitAnimation: (label, next, nextFrameIndex, mergeKey) => {
    const { animation, frameIndex, history, activeLayerId } = get();
    if (next === animation) return;
    const derived = derive(next, nextFrameIndex ?? frameIndex, activeLayerId);
    const before: Checkpoint = { animation, frameIndex };
    const after: Checkpoint = { animation: next, frameIndex: derived.frameIndex };
    set({
      ...derived,
      history: pushEntry(history, snapshotEntry(label, before, after, mergeKey)),
      dirty: true,
    });
  },

  setFrameIndex: (index) => {
    const { animation, frameIndex, activeLayerId } = get();
    if (clampFrameIndex(animation, index) === frameIndex) return;
    set(derive(animation, index, activeLayerId));
  },

  setActiveLayer: (id) => {
    if (findLayer(get().doc, id)) set({ activeLayerId: id });
  },

  undo: () => {
    const { animation, frameIndex, history, activeLayerId } = get();
    const result = undoHistory(history, { animation, frameIndex });
    if (!result) return;
    const { doc: checkpoint } = result;
    set({
      ...derive(checkpoint.animation, checkpoint.frameIndex, activeLayerId),
      history: result.history,
      dirty: true,
    });
  },

  redo: () => {
    const { animation, frameIndex, history, activeLayerId } = get();
    const result = redoHistory(history, { animation, frameIndex });
    if (!result) return;
    const { doc: checkpoint } = result;
    set({
      ...derive(checkpoint.animation, checkpoint.frameIndex, activeLayerId),
      history: result.history,
      dirty: true,
    });
  },

  markSaved: (file, saved) => set((state) => ({ file, dirty: state.animation !== saved })),
}));

/** Активный слой текущего кадра, если его можно редактировать. */
export function editableActiveLayer(state: DocumentState): Layer | null {
  const layer = findLayer(state.doc, state.activeLayerId);
  return canEditLayer(layer) ? layer : null;
}
