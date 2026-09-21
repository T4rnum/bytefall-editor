import { makeCell } from '../../core/cell';
import { editableActiveLayer, useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import type { ToolEnv } from './types';

/** Снимок обоих сторов плюс колбэки: инструменты не знают о Zustand. */
export function buildToolEnv(): ToolEnv {
  const docState = useDocumentStore.getState();
  const editor = useEditorStore.getState();
  const layer = editableActiveLayer(docState);
  return {
    doc: docState.doc,
    layer,
    brush: makeCell(editor.glyph, editor.fg, editor.bg),
    shapeFill: editor.shapeFill,
    selection: editor.selection,
    textCursor: editor.textCursor,
    selectedObjectId: editor.selectedObjectId,
    setPreview: (edits) => editor.setPreview(edits && layer ? { layerId: layer.id, edits } : null),
    commit: (edits, label) => {
      if (layer) docState.commitCells(layer.id, edits, label);
    },
    setSelection: editor.setSelection,
    pick: (cell) => {
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
