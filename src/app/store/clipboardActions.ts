import { findLayer } from '../../core/document';
import { clampRect } from '../../core/geometry';
import { clearRectEdits, copyRect, pasteEdits } from '../../core/selection';
import { editableActiveLayer, useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';

export function copySelectionAction(): void {
  const { selection, setClipboard } = useEditorStore.getState();
  const { doc, activeLayerId } = useDocumentStore.getState();
  const layer = findLayer(doc, activeLayerId);
  if (!selection || !layer) return;
  setClipboard(copyRect(layer.cells, selection));
}

export function deleteSelectionAction(): void {
  const { selection } = useEditorStore.getState();
  const docState = useDocumentStore.getState();
  const layer = editableActiveLayer(docState);
  if (!selection || !layer) return;
  docState.commitCells(layer.id, clearRectEdits(layer.cells, selection), 'Delete');
}

export function cutSelectionAction(): void {
  copySelectionAction();
  deleteSelectionAction();
}

/** Вставка в левый верхний угол выделения, иначе под курсор, иначе в начало холста. */
export function pasteAction(): void {
  const editor = useEditorStore.getState();
  const docState = useDocumentStore.getState();
  const layer = editableActiveLayer(docState);
  const clip = editor.clipboard;
  if (!clip || !layer) return;
  const { width, height } = docState.doc;
  const origin = editor.selection ?? editor.cursorCell ?? { x: 0, y: 0 };
  const x = Math.max(0, Math.min(width - 1, origin.x));
  const y = Math.max(0, Math.min(height - 1, origin.y));
  docState.commitCells(layer.id, pasteEdits(clip, x, y, width, height), 'Paste');
  editor.setSelection(clampRect({ x, y, w: clip.width, h: clip.height }, width, height));
}

export function selectAllAction(): void {
  const { doc } = useDocumentStore.getState();
  useEditorStore.getState().setSelection({ x: 0, y: 0, w: doc.width, h: doc.height });
}
