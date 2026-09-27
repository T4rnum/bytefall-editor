import { type Cell, isBlankCell, makeCell } from '../../core/cell';
import type { CellEdits } from '../../core/grid';
import { clipEditsToSelection } from '../../core/selection';
import { findLayer } from '../../core/document';
import { resizeCanvasAction } from '../store/documentActions';
import {
  editableActiveLayer,
  paintableActiveLayer,
  useDocumentStore,
} from '../store/documentStore';
import { setCamera3DPoseAction } from '../store/scene3dActions';
import { type Brush, activeBrush, brushOf, useEditorStore } from '../store/editorStore';
import { buildEditContext } from './editSession';
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
  const active = activeBrush(editor);
  // Правка изнутри: рисуют в сетке объекта, а выделение — это его символы, а не ячейки холста.
  const edit = buildEditContext(docState.doc, editor, docState.time);
  const layer = edit
    ? (findLayer(docState.doc, edit.session.object.layerId) ?? null)
    : paintableActiveLayer(docState);
  // 3D-слой не рисуют, а крутят: его сцена — для инструмента «Орбита».
  const activeLayer = editableActiveLayer(docState);
  const scene3d = activeLayer?.scene ? { layerId: activeLayer.id, scene: activeLayer.scene } : null;
  // Пока выделение есть, кисть работает только внутри него. Сами инструменты выделения из
  // этого правила выведены: перенос ячеек обязан выходить за прежнюю маску.
  const mask = getTool(editor.tool).ignoresSelection || edit ? null : editor.selection;
  const clip = (edits: CellEdits): CellEdits => (mask ? clipEditsToSelection(edits, mask) : edits);
  const { doc } = docState;
  return {
    doc,
    layer,
    scene3d,
    target: edit?.target ?? {
      cells: layer?.cells ?? new Map(),
      width: doc.width,
      height: doc.height,
    },
    editing: edit?.session ?? null,
    brush: makeCell(active.glyph, active.fg, active.bg),
    brushFor: (button) => toCell(brushOf(editor, button)),
    shapeFill: editor.shapeFill,
    wandContiguous: editor.wandContiguous,
    selection: edit ? null : editor.selection,
    textCursor: editor.textCursor,
    selectedObjectId: editor.selectedObjectId,
    selectedObjectIds:
      editor.selectedObjectIds.length > 0
        ? editor.selectedObjectIds
        : editor.selectedObjectId
          ? [editor.selectedObjectId]
          : [],
    zoom: editor.camera.zoom,
    setPreview: (edits) => {
      if (edit) edit.preview(edits);
      else editor.setPreview(edits && layer ? { layerId: layer.id, edits: clip(edits) } : null);
    },
    commit: (edits, label) => {
      if (edit) edit.commit(edits, label);
      else if (layer) docState.commitCells(layer.id, clip(edits), label);
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
    setSelectedObjects: editor.setSelectedObjects,
    setDraft: editor.setDraft,
    commitDocument: docState.commitStructural,
    setCanvasFrame: editor.setCanvasFrame,
    resizeCanvas: resizeCanvasAction,
    setCamera3D: setCamera3DPoseAction,
  };
}
