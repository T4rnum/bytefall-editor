import type { Document } from '../../core/document';
import { evaluate } from '../../core/evaluate';
import type { Point } from '../../core/geometry';
import { type CellKey, keyOf, xOf, yOf } from '../../core/grid';
import { applyEdit } from '../../core/keyframes';
import { type SceneObject, canEditObject, findObject } from '../../core/object';
import {
  type EditArea,
  applyLocalEdits,
  editArea,
  rebaseInDocument,
  rebaseObject,
} from '../../core/objectEdit';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { notify } from './notifyStore';

/**
 * Правка объекта изнутри (Tab, как Edit Mode в Blender): инструменты рисуют в сетке объекта,
 * выделение ловит его символы там, где их видно. Сетка и сдвиг начала — `core/objectEdit.ts`.
 */

const docState = () => useDocumentStore.getState();
const editor = () => useEditorStore.getState();

const ZERO: Point = { x: 0, y: 0 };

/** Объект в правке изнутри, если он есть в кадре. */
export function editingObject(): SceneObject | undefined {
  const id = editor().editingObjectId;
  return id ? findObject(docState().doc, id) : undefined;
}

/** Изменение объекта изнутри: документ приходит уже со сдвинутым началом и сам сдвиг. */
export type ObjectChange = (doc: Document, shift: Point) => Document;

/** Черновик изменения для превью: сдвиг начала — только в этом документе, без ключей. */
export function previewObjectChange(
  id: string,
  shift: Point | null,
  change: ObjectChange,
): Document {
  const { doc } = docState();
  return change(shift ? rebaseInDocument(doc, id, shift) : doc, shift ?? ZERO);
}

/**
 * Коммит изменения объекта изнутри. Без сдвига начала — обычная структурная правка. Со сдвигом
 * начало переезжает во всей анимации — во всех кадрах и в ключах положения — одной записью
 * вместе с изменением, и выделенные символы едут за своими ячейками.
 *
 * `select` — ключи выделения после изменения, в координатах до сдвига; без него выделение
 * остаётся прежним, только сдвинутым.
 */
export function commitObjectChange(
  id: string,
  label: string,
  shift: Point | null,
  change: ObjectChange,
  select?: readonly Point[],
): void {
  const { doc, animation, time, commitStructural, commitAnimation } = docState();
  const s = shift ?? ZERO;
  const areaBefore = objectArea(doc, id);
  const keep = select ?? editor().glyphSelection.map((k) => ({ x: xOf(k), y: yOf(k) }));
  if (!shift) {
    commitStructural(label, change(doc, ZERO));
  } else {
    const rebased = rebaseObject(animation, id, shift);
    const before = evaluate(rebased, time);
    commitAnimation(label, applyEdit(rebased, time, before, change(before, s)));
  }
  if (editor().editingObjectId !== id) return;
  const obj = findObject(docState().doc, id);
  followTextCursor(areaBefore, obj ? editArea(obj) : null, s);
  const keys = keep
    .map((p) => ({ x: p.x + s.x, y: p.y + s.y }))
    .filter((p) => p.x >= 0 && p.y >= 0)
    .map((p) => keyOf(p.x, p.y))
    .filter((key) => obj?.cells.has(key));
  editor().setGlyphSelection([...new Set(keys)].sort((a, b) => a - b));
}

const objectArea = (doc: Document, id: string): EditArea | null => {
  const obj = findObject(doc, id);
  return obj ? editArea(obj) : null;
};

/**
 * Текстовый курсор правки изнутри стоит в ячейке области правки, а область зависит от
 * содержимого и от начала объекта. После изменения курсор переезжает так, чтобы остаться на
 * той же ячейке объекта, — иначе ввод продолжился бы не там.
 */
function followTextCursor(before: EditArea | null, after: EditArea | null, s: Point): void {
  const cursor = editor().textCursor;
  if (!cursor || !before || !after) return;
  editor().setTextCursor({
    x: cursor.x - before.offset.x + s.x + after.offset.x,
    y: cursor.y - before.offset.y + s.y + after.offset.y,
  });
}

/** Tab: войти в правку главного выбранного объекта или выйти из неё. */
export function toggleEditModeAction(): void {
  const state = editor();
  if (state.editingObjectId) {
    state.setEditing(null);
    return;
  }
  const obj = state.selectedObjectId ? findObject(docState().doc, state.selectedObjectId) : null;
  if (!obj) {
    notify('Выбери объект, чтобы править его символы (Tab)');
    return;
  }
  if (obj.rig) {
    notify('У кости и контроллера нет символов', 'error');
    return;
  }
  if (!canEditObject(docState().doc, obj)) {
    notify('Объект или его слой заперт', 'error');
    return;
  }
  // Выделение ячеек холста в правке изнутри ничего не значит: его место занимают символы.
  state.setSelection(null);
  state.setSelectedObject(obj.id);
  state.setEditing(obj.id);
}

/** Ctrl+A в правке изнутри: все символы объекта. false — правки нет, пусть решает холст. */
export function selectAllGlyphsAction(): boolean {
  const obj = editingObject();
  if (!obj) return false;
  editor().setGlyphSelection([...obj.cells.keys()].sort((a, b) => a - b));
  return true;
}

/** Delete в правке изнутри: стирает выделенные символы. false — правки нет. */
export function deleteSelectedGlyphsAction(): boolean {
  const obj = editingObject();
  if (!obj) return false;
  const keys = editor().glyphSelection;
  if (keys.length === 0) return true;
  if (!canEditObject(docState().doc, obj)) {
    notify('Объект или его слой заперт', 'error');
    return true;
  }
  const edits = keys.map((k) => ({ x: xOf(k), y: yOf(k), cell: null }));
  commitObjectChange(
    obj.id,
    'Delete glyphs',
    null,
    (doc) => applyLocalEdits(doc, obj.id, edits),
    [],
  );
  return true;
}

/** Esc в правке изнутри: сначала снимает выделение символов, потом выходит из правки. */
export function escapeEditAction(): boolean {
  const state = editor();
  if (!state.editingObjectId) return false;
  if (state.glyphSelection.length > 0) state.setGlyphSelection([]);
  else state.setEditing(null);
  return true;
}

/** Ключи выделенных символов, которые есть у объекта: после отмены часть могла пропасть. */
export function liveGlyphSelection(obj: SceneObject, keys: readonly CellKey[]): CellKey[] {
  return keys.filter((k) => obj.cells.has(k));
}
