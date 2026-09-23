import { create } from 'zustand';
import { type Animation, createAnimation } from '../../core/animation';
import {
  type Document,
  type Layer,
  canEditLayer,
  createDocument,
  findLayer,
} from '../../core/document';
import { evaluate } from '../../core/evaluate';
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
import { applyEdit, pruneTracks } from '../../core/keyframes';
import { clampTime } from '../../core/time';
import { frameIndexAt, frameStart } from '../../core/timeline';

export interface FileRef {
  readonly name: string | null;
  readonly handle: FileSystemFileHandle | null;
}

/** Состояние, которым оперирует история: анимация и момент, где стоял пользователь. */
export interface Checkpoint {
  readonly animation: Animation;
  readonly time: number;
}

export interface DocumentState {
  readonly animation: Animation;
  /** Указатель времени, миллисекунды от начала сцены. */
  readonly time: number;
  /** Кадр спрайт-трека, который идёт в момент `time`: в него пишут кисти. */
  readonly frameIndex: number;
  /**
   * Сцена в момент `time` как документ: кадр с треками поверх. Её видят вьюпорт, панели и
   * инструменты; правки из неё возвращаются в анимацию через `commitStructural`.
   */
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
  /**
   * Структурная операция над сценой на экране: объекты, палитра, имя, фон. Анимированные
   * свойства, которые она поменяла, становятся ключами в текущий момент, см. `applyEdit`.
   * `mergeKey` склеивает подряд идущие записи одного жеста, как у `commitAnimation`.
   */
  commitStructural: (label: string, next: Document, mergeKey?: string) => void;
  /**
   * Операция над всей анимацией: кадры, общие для всех кадров слои, ключи. С `nextFrameIndex`
   * указатель встаёт на начало этого кадра, иначе остаётся на месте. `mergeKey` склеивает
   * подряд идущие записи одной серии, см. `core/history.ts`.
   */
  commitAnimation: (
    label: string,
    next: Animation,
    nextFrameIndex?: number,
    mergeKey?: string,
  ) => void;
  setTime: (time: number) => void;
  /** Ставит указатель на начало кадра спрайт-трека. */
  setFrameIndex: (index: number) => void;
  setActiveLayer: (id: string) => void;
  undo: () => void;
  redo: () => void;
  /** Снимает признак изменений только если на диск ушла текущая версия. */
  markSaved: (file: FileRef, saved: Animation) => void;
}

const topLayerId = (doc: Document): string => doc.layers[doc.layers.length - 1].id;

type Derived = Pick<
  DocumentState,
  'animation' | 'time' | 'frameIndex' | 'doc' | 'activeLayerId' | 'dirtyKeys'
>;
type Previous = Pick<DocumentState, 'animation' | 'frameIndex' | 'doc'>;

/**
 * Согласованный срез состояния после смены анимации или момента времени. Пока анимация та же,
 * кадр тот же и треков нет, сцена — тот же объект: смена времени внутри кадра ничего не
 * пересобирает.
 *
 * `dirtyKeys` по умолчанию null, то есть «изменилось неизвестно что». Только коммит ячеек знает
 * точный список и выставляет его сам; всё остальное — смена кадра, структурная правка, отмена —
 * честно требует полной пересборки.
 */
function derive(
  animation: Animation,
  time: number,
  activeLayerId: string,
  previous?: Previous,
): Derived {
  const t = clampTime(time);
  const frameIndex = frameIndexAt(animation, t);
  const still =
    previous?.animation === animation &&
    previous.frameIndex === frameIndex &&
    animation.tracks.length === 0;
  const doc = still ? previous.doc : evaluate(animation, t);
  return {
    animation,
    time: t,
    frameIndex,
    doc,
    activeLayerId: findLayer(doc, activeLayerId) ? activeLayerId : topLayerId(doc),
    dirtyKeys: null,
  };
}

/** Запись над кадром: после undo и redo пользователь возвращается в момент правки. */
function frameEntry(entry: HistoryEntry<Animation>, time: number): HistoryEntry<Checkpoint> {
  return {
    label: entry.label,
    apply: (c) => ({ animation: entry.apply(c.animation), time }),
    revert: (c) => ({ animation: entry.revert(c.animation), time }),
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
    const { doc, animation, frameIndex, time, history, activeLayerId } = get();
    if (!canEditLayer(findLayer(doc, layerId))) return false;
    // Ячейки треки не трогают: у сцены на экране они те же, что в кадре.
    const entry = cellEditsEntry(doc, layerId, edits, label);
    if (!entry) return true;
    const lifted = liftToFrame(entry, frameIndex);
    set({
      ...derive(lifted.apply(animation), time, activeLayerId),
      // Коммит знает, какие ячейки тронул: кадр пересоберётся только в их тайлах.
      dirtyKeys: [...edits.keys()],
      history: pushEntry(history, frameEntry(lifted, time)),
      dirty: true,
    });
    return true;
  },

  commitStructural: (label, next, mergeKey) => {
    const { doc, animation, time } = get();
    if (next === doc) return;
    get().commitAnimation(label, applyEdit(animation, time, doc, next), undefined, mergeKey);
  },

  commitAnimation: (label, proposed, nextFrameIndex, mergeKey) => {
    const { animation, time, history, activeLayerId } = get();
    // Удалённый объект, слой или эффект уносит свои треки: ключам не на что больше ссылаться.
    const next = pruneTracks(proposed);
    if (next === animation) return;
    const nextTime = nextFrameIndex === undefined ? time : frameStart(next, nextFrameIndex);
    const derived = derive(next, nextTime, activeLayerId);
    const before: Checkpoint = { animation, time };
    const after: Checkpoint = { animation: next, time: derived.time };
    set({
      ...derived,
      history: pushEntry(history, snapshotEntry(label, before, after, mergeKey)),
      dirty: true,
    });
  },

  setTime: (time) => {
    const state = get();
    if (clampTime(time) === state.time) return;
    set(derive(state.animation, time, state.activeLayerId, state));
  },

  setFrameIndex: (index) => get().setTime(frameStart(get().animation, index)),

  setActiveLayer: (id) => {
    if (findLayer(get().doc, id)) set({ activeLayerId: id });
  },

  undo: () => {
    const { animation, time, history, activeLayerId } = get();
    const result = undoHistory(history, { animation, time });
    if (!result) return;
    const { doc: checkpoint } = result;
    set({
      ...derive(checkpoint.animation, checkpoint.time, activeLayerId),
      history: result.history,
      dirty: true,
    });
  },

  redo: () => {
    const { animation, time, history, activeLayerId } = get();
    const result = redoHistory(history, { animation, time });
    if (!result) return;
    const { doc: checkpoint } = result;
    set({
      ...derive(checkpoint.animation, checkpoint.time, activeLayerId),
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
