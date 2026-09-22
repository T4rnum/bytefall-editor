import { findLayer } from '../../core/document';
import {
  type Clip,
  clearSelectionEdits,
  copySelection,
  pasteEdits,
  selectionFromRect,
} from '../../core/selection';
import { editableActiveLayer, useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import {
  copySelectedObjectAction,
  cutSelectedObjectAction,
  pasteObjectAction,
} from './objectActions';

/**
 * Что копировать, решает инструмент: у инструмента объектов — выбранный объект, у остальных —
 * выделенные ячейки. Угадывать по тому, что где выбрано, хуже: выделение и объект бывают
 * одновременно, и `Ctrl+C` тогда делал бы то одно, то другое.
 */
const objectsInFocus = (): boolean => useEditorStore.getState().tool === 'object';

function copyCells(): void {
  const { selection, setClipboard } = useEditorStore.getState();
  const { doc, activeLayerId } = useDocumentStore.getState();
  const layer = findLayer(doc, activeLayerId);
  if (!selection || !layer) return;
  setClipboard({ kind: 'cells', clip: copySelection(layer.cells, selection) });
}

export function copyAction(): void {
  if (objectsInFocus()) copySelectedObjectAction();
  else copyCells();
}

export function deleteSelectionAction(): void {
  const { selection } = useEditorStore.getState();
  const docState = useDocumentStore.getState();
  const layer = editableActiveLayer(docState);
  if (!selection || !layer) return;
  docState.commitCells(layer.id, clearSelectionEdits(layer.cells, selection), 'Delete');
}

export function cutAction(): void {
  if (objectsInFocus()) {
    cutSelectedObjectAction();
    return;
  }
  copyCells();
  deleteSelectionAction();
}

/** Вставляется то, что скопировали последним: объект — объектом, ячейки — ячейками. */
export function pasteAction(): void {
  const clipboard = useEditorStore.getState().clipboard;
  if (clipboard?.kind === 'object') pasteObjectAction(clipboard.object);
  else if (clipboard?.kind === 'cells') pasteCells(clipboard.clip);
}

/** Вставка ячеек в левый верхний угол выделения, иначе под курсор, иначе в начало холста. */
function pasteCells(clip: Clip): void {
  const editor = useEditorStore.getState();
  const docState = useDocumentStore.getState();
  const layer = editableActiveLayer(docState);
  if (!layer) return;
  const { width, height } = docState.doc;
  const origin = editor.selection?.bounds ?? editor.cursorCell ?? { x: 0, y: 0 };
  const x = Math.max(0, Math.min(width - 1, origin.x));
  const y = Math.max(0, Math.min(height - 1, origin.y));
  docState.commitCells(layer.id, pasteEdits(clip, x, y, width, height), 'Paste');
  editor.setSelection(selectionFromRect({ x, y, w: clip.width, h: clip.height }, width, height));
}

export function selectAllAction(): void {
  const { doc } = useDocumentStore.getState();
  const all = selectionFromRect({ x: 0, y: 0, w: doc.width, h: doc.height }, doc.width, doc.height);
  useEditorStore.getState().setSelection(all);
}
