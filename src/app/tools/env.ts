import { type Cell, isBlankCell, makeCell } from '../../core/cell';
import type { CellEdits } from '../../core/grid';
import { clipEditsToSelection } from '../../core/selection';
import { editableActiveLayer, useDocumentStore } from '../store/documentStore';
import { type Brush, activeBrush, brushOf, useEditorStore } from '../store/editorStore';
import { getTool } from './index';
import type { ToolEnv } from './types';

/** Кисть без символа и без фона — это ластик, инструментам он приходит как `null`. */
const toCell = (b: Brush): Cell | null => {
  const cell = makeCell(b.glyph, b.fg, b.bg);
  return isBlankCell(cell) ? null : cell;
};

/** Снимок обоих сторов плюс колбэки: инструменты не знают о Zustand. */
export function buildToolEnv(): ToolEnv {
  const docState = useDocumentStore.getState();
  const editor = useEditorStore.getState();
  const layer = editableActiveLayer(docState);
  const active = activeBrush(editor);
  // Пока выделение есть, кисть работает только внутри него. Сами инструменты выделения из
  // этого правила выведены: перенос ячеек обязан выходить за прежнюю маску.
  const mask = getTool(editor.tool).ignoresSelection ? null : editor.selection;
  const clip = (edits: CellEdits): CellEdits => (mask ? clipEditsToSelection(edits, mask) : edits);
  return {
    doc: docState.doc,
    layer,
    brush: makeCell(active.glyph, active.fg, active.bg),
    brushFor: (button) => toCell(brushOf(editor, button)),
    shapeFill: editor.shapeFill,
    wandContiguous: editor.wandContiguous,
    selection: editor.selection,
    textCursor: editor.textCursor,
    selectedObjectId: editor.selectedObjectId,
    setPreview: (edits) =>
      editor.setPreview(edits && layer ? { layerId: layer.id, edits: clip(edits) } : null),
    commit: (edits, label) => {
      if (layer) docState.commitCells(layer.id, clip(edits), label);
    },
    setSelection: editor.setSelection,
    pick: (cell, button = 0) => {
      const slot = button === 2 ? 1 : 0;
      // Пипетка правит ту кисть, которой этой же кнопкой и рисуют, а не только активную.
      if (slot !== editor.activeBrush) editor.setActiveBrush(slot);
      if (cell.glyph !== '') editor.setGlyph(cell.glyph);
      editor.setFg(cell.fg);
      editor.setBg(cell.bg);
    },
    setTextCursor: editor.setTextCursor,
    setSelectedObject: editor.setSelectedObject,
    setDraft: editor.setDraft,
    commitDocument: docState.commitStructural,
  };
}
