import { cellsIntoObject, glyphsIntoLayer, recolorEdits } from '../../core/cellTransfer';
import { findLayer, setLayerCells } from '../../core/document';
import { applyEdits, keyOf, xOf, yOf } from '../../core/grid';
import { placedGlyphs } from '../../core/glyphPick';
import { canEditObject, findObject } from '../../core/object';
import { type LocalEdit, applyLocalEdits, neededShift } from '../../core/objectEdit';
import { objectMatrix } from '../../core/placement';
import { selectionCells } from '../../core/selection';
import { plural } from '../ui/plural';
import { paintableActiveLayer, useDocumentStore } from './documentStore';
import { activeBrush, useEditorStore } from './editorStore';
import { notify } from './notifyStore';
import { commitObjectChange, editingObject } from './objectEditActions';

/**
 * Ячейки между слоем и объектом без разборки объекта и перекраска выделенного. Геометрия
 * переноса — `core/cellTransfer.ts`, сдвиг начала объекта — `commitObjectChange`.
 */

const docState = () => useDocumentStore.getState();
const editor = () => useEditorStore.getState();

const GLYPHS = { one: 'символ', few: 'символа', many: 'символов' } as const;

/**
 * Ctrl+J: выделенные ячейки активного слоя уходят в выбранный объект — в клетки его сетки под
 * своими центрами, повёрнут он или нет. Ячейки левее или выше начала сдвигают начало объекта.
 */
export function joinSelectionToObjectAction(): void {
  const { selection, selectedObjectId, editingObjectId } = editor();
  const state = docState();
  const layer = paintableActiveLayer(state);
  const obj = selectedObjectId ? findObject(state.doc, selectedObjectId) : undefined;
  if (editingObjectId) {
    notify('Выйди из правки (Tab): в правке выделение ловит символы объекта, а не ячейки слоя');
    return;
  }
  if (!selection || !layer || !obj || obj.rig) {
    notify('Выдели ячейки на слое и выбери объект, в который их добавить', 'error');
    return;
  }
  if (!canEditObject(state.doc, obj)) {
    notify('Объект или его слой заперт', 'error');
    return;
  }
  const { local, cleared } = cellsIntoObject(layer.cells, selection, objectMatrix(state.doc, obj));
  if (local.length === 0) {
    notify('В выделении нет символов', 'error');
    return;
  }
  commitObjectChange(obj.id, 'Add cells to object', neededShift(local), (doc, s) => {
    const withCells = applyLocalEdits(doc, obj.id, local, s);
    const source = findLayer(withCells, layer.id);
    return source
      ? setLayerCells(withCells, layer.id, applyEdits(source.cells, cleared))
      : withCells;
  });
  editor().setSelection(null);
}

/**
 * Ctrl+Shift+J в правке изнутри: выделенные символы ложатся в слой объекта туда, где их видно
 * сейчас, и уходят из объекта. Объект остаётся объектом.
 */
export function extractGlyphsAction(): void {
  const obj = editingObject();
  const keys = editor().glyphSelection;
  if (!obj || keys.length === 0) {
    notify('Войди в правку объекта (Tab) и выдели символы, которые вынуть в слой');
    return;
  }
  const { doc, time } = docState();
  const layer = findLayer(doc, obj.layerId);
  if (!layer || !canEditObject(doc, obj)) {
    notify('Объект или его слой заперт', 'error');
    return;
  }
  const placed = placedGlyphs(doc, obj, time);
  const out = glyphsIntoLayer(obj.cells, placed, keys, doc.width, doc.height);
  commitObjectChange(
    obj.id,
    'Extract glyphs',
    null,
    (next) => {
      const without = applyLocalEdits(next, obj.id, out.removed);
      const target = findLayer(without, layer.id);
      return target
        ? setLayerCells(without, layer.id, applyEdits(target.cells, out.layer))
        : without;
    },
    [],
  );
  if (out.lost > 0) notify(`За краем холста пропало: ${plural(out.lost, GLYPHS)}`, 'error');
}

/**
 * Alt+Backspace: цвета активной кисти на выделенное — символы объекта в правке изнутри или
 * ячейки слоя. Сами символы остаются: меняются цвет символа и фона.
 */
export function recolorSelectionAction(): void {
  const brush = activeBrush(editor());
  const obj = editingObject();
  if (obj) {
    const keys = editor().glyphSelection;
    if (keys.length === 0) {
      notify('Выдели символы, которые перекрасить');
      return;
    }
    if (!canEditObject(docState().doc, obj)) {
      notify('Объект или его слой заперт', 'error');
      return;
    }
    const edits = recolorEdits(obj.cells, keys, brush.fg, brush.bg);
    const local: LocalEdit[] = [...edits].map(([key, cell]) => ({
      x: xOf(key),
      y: yOf(key),
      cell,
    }));
    if (local.length === 0) return;
    commitObjectChange(obj.id, 'Recolor glyphs', null, (doc) =>
      applyLocalEdits(doc, obj.id, local),
    );
    return;
  }
  const { selection } = editor();
  const state = docState();
  const layer = paintableActiveLayer(state);
  if (!selection || !layer) {
    notify('Выдели ячейки на слое или символы объекта в правке (Tab)');
    return;
  }
  const keys = [...selectionCells(selection)].map((p) => keyOf(p.x, p.y));
  const edits = recolorEdits(layer.cells, keys, brush.fg, brush.bg);
  if (edits.size > 0) state.commitCells(layer.id, edits, 'Recolor');
}
