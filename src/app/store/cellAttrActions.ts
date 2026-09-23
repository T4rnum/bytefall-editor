import { parseAttrValue } from '../../core/cell';
import { cellsWithAttr, isValidAttrKey, removeAttrEdits, setAttrEdits } from '../../core/cellAttrs';
import { findLayer } from '../../core/document';
import { selectionFromPoints } from '../../core/selection';
import { MAX_ATTR_STRING_LENGTH, MAX_ID_LENGTH } from '../../core/serialization';
import { revealPanel } from '../ui/Panel';
import { plural } from '../ui/plural';
import { editableActiveLayer, useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { notify } from './notifyStore';

const cellForms = { one: 'ячейке', few: 'ячейках', many: 'ячейках' };

/** Панель свойств ячеек и поле нового свойства: к ним ведёт горячая клавиша. */
export const CELL_ATTRS_PANEL_ID = 'cell-attrs';
export const CELL_ATTR_KEY_INPUT_ID = 'cell-attr-key';

/** Слой и выделение, с которыми работают свойства ячеек; иначе сообщение и null. */
function target() {
  const state = useDocumentStore.getState();
  const { selection } = useEditorStore.getState();
  const layer = editableActiveLayer(state);
  if (!selection) {
    notify('Сначала выделите ячейки', 'error');
    return null;
  }
  if (!layer) {
    notify('Активный слой скрыт или заперт', 'error');
    return null;
  }
  return { state, layer, selection };
}

/**
 * Ставит свойство выделенным ячейкам активного слоя одной записью истории: всем, либо с
 * `onlyExisting` только тем, у кого оно уже есть.
 */
export function setCellAttrAction(rawKey: string, text: string, onlyExisting = false): void {
  const key = rawKey.trim();
  if (!isValidAttrKey(key)) {
    notify(`Имя свойства — от 1 до ${MAX_ID_LENGTH} знаков`, 'error');
    return;
  }
  const value = parseAttrValue(text);
  if (typeof value === 'string' && value.length > MAX_ATTR_STRING_LENGTH) {
    notify(`Значение не длиннее ${MAX_ATTR_STRING_LENGTH} знаков`, 'error');
    return;
  }
  const t = target();
  if (!t) return;
  const { edits, skipped } = setAttrEdits(t.layer.cells, t.selection, key, value, onlyExisting);
  t.state.commitCells(t.layer.id, edits, 'Set cell attribute');
  if (skipped > 0) {
    notify(`Свойств уже предел, пропущено в ${plural(skipped, cellForms)}`, 'error');
  }
}

export function removeCellAttrAction(key: string): void {
  const t = target();
  if (!t) return;
  t.state.commitCells(
    t.layer.id,
    removeAttrEdits(t.layer.cells, t.selection, key),
    'Remove cell attribute',
  );
}

/**
 * Выделяет все ячейки активного слоя с этим свойством. Так метки становятся видимыми: их
 * можно проверить глазами. Запертый слой тоже годится — выделение его не меняет.
 */
export function selectCellsWithAttrAction(key: string): void {
  const { doc, activeLayerId } = useDocumentStore.getState();
  const layer = findLayer(doc, activeLayerId);
  if (!layer) return;
  const selection = selectionFromPoints(cellsWithAttr(layer.cells, key), doc.width, doc.height);
  if (!selection) {
    notify(`На слое нет ячеек со свойством «${key}»`);
    return;
  }
  useEditorStore.getState().setSelection(selection);
}

/** Горячая клавиша: развернуть панель свойств и поставить курсор в имя нового свойства. */
export function focusCellAttrInputAction(): void {
  revealPanel(CELL_ATTRS_PANEL_ID);
  // Поле появляется после отрисовки развёрнутой панели, поэтому фокус — на следующем шаге.
  setTimeout(() => {
    const input = document.getElementById(CELL_ATTR_KEY_INPUT_ID);
    if (input) input.focus();
    else notify('Сначала выделите ячейки с символом или фоном');
  }, 0);
}
