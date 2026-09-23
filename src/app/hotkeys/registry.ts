import {
  copyAction,
  cutAction,
  deleteSelectionAction,
  pasteAction,
  selectAllAction,
} from '../store/clipboardActions';
import { focusCellAttrInputAction } from '../store/cellAttrActions';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { openDocumentAction, saveDocumentAction } from '../store/fileActions';
import { stepFrameAction, togglePlaybackAction } from '../store/frameActions';
import {
  duplicateSelectedObjectAction,
  groupSelectionAction,
  stepSelectedObjectLayerAction,
  ungroupSelectedObjectAction,
} from '../store/objectActions';
import {
  resetSelectedRotationAction,
  resetSelectedScaleAction,
  rotateSelectedObjectAction,
} from '../store/transformActions';
import { useUiStore } from '../store/uiStore';
import { fitViewAction, zoomByAction } from '../store/viewActions';
import { TOOLS, getTool } from '../tools';
import { buildToolEnv } from '../tools/env';
import { type KeyChord, MatchQuality, matchQuality } from './match';

export type HotkeyGroup = 'Файл' | 'Правка' | 'Объекты' | 'Кадры' | 'Вид' | 'Инструменты';

export interface Hotkey {
  readonly group: HotkeyGroup;
  readonly label: string;
  /** Запись клавиш: она же показывается в справке и она же разбирается в обработчик. */
  readonly keys: string;
  /** Показывать ли в справке: дубли вроде Ctrl+Y её только засоряют. */
  readonly hidden?: boolean;
  readonly run: () => void;
}

const editor = () => useEditorStore.getState();

/** Отмена текущего действия: снимает всё, что можно снять, не трогая документ. */
function cancelEverything(): void {
  const state = editor();
  getTool(state.tool).cancel?.(buildToolEnv());
  state.setSelection(null);
  state.setTextCursor(null);
  state.setSelectedObject(null);
  state.setPlaying(false);
  useUiStore.getState().setHotkeysOpen(false);
}

/** Сочетания, не зависящие от набора инструментов. */
const STATIC_HOTKEYS: readonly Hotkey[] = [
  {
    group: 'Файл',
    label: 'Открыть или импортировать',
    keys: 'Ctrl+O',
    run: () => void openDocumentAction(),
  },
  { group: 'Файл', label: 'Сохранить', keys: 'Ctrl+S', run: () => void saveDocumentAction(false) },
  {
    group: 'Файл',
    label: 'Сохранить как',
    keys: 'Ctrl+Shift+S',
    run: () => void saveDocumentAction(true),
  },

  {
    group: 'Правка',
    label: 'Отменить',
    keys: 'Ctrl+Z',
    run: () => useDocumentStore.getState().undo(),
  },
  {
    group: 'Правка',
    label: 'Повторить',
    keys: 'Ctrl+Shift+Z',
    run: () => useDocumentStore.getState().redo(),
  },
  {
    group: 'Правка',
    label: 'Повторить',
    keys: 'Ctrl+Y',
    hidden: true,
    run: () => useDocumentStore.getState().redo(),
  },
  { group: 'Правка', label: 'Вырезать', keys: 'Ctrl+X', run: cutAction },
  { group: 'Правка', label: 'Копировать', keys: 'Ctrl+C', run: copyAction },
  { group: 'Правка', label: 'Вставить', keys: 'Ctrl+V', run: pasteAction },
  { group: 'Правка', label: 'Выделить всё', keys: 'Ctrl+A', run: selectAllAction },
  { group: 'Правка', label: 'Удалить выделенное', keys: 'Delete', run: deleteSelectionAction },
  {
    group: 'Правка',
    label: 'Удалить выделенное',
    keys: 'Backspace',
    hidden: true,
    run: deleteSelectionAction,
  },
  { group: 'Правка', label: 'Отмена действия', keys: 'Escape', run: cancelEverything },

  { group: 'Объекты', label: 'Собрать объект', keys: 'Ctrl+G', run: groupSelectionAction },
  {
    group: 'Объекты',
    label: 'Разобрать объект',
    keys: 'Ctrl+Shift+G',
    run: ungroupSelectedObjectAction,
  },
  { group: 'Объекты', label: 'Дублировать', keys: 'Ctrl+D', run: duplicateSelectedObjectAction },
  {
    group: 'Правка',
    label: 'Свойства выделенных ячеек',
    keys: 'Alt+Enter',
    run: focusCellAttrInputAction,
  },
  {
    group: 'Объекты',
    label: 'Перенести на слой выше',
    keys: 'Alt+]',
    run: () => stepSelectedObjectLayerAction(1),
  },
  {
    group: 'Объекты',
    label: 'Перенести на слой ниже',
    keys: 'Alt+[',
    run: () => stepSelectedObjectLayerAction(-1),
  },
  {
    group: 'Объекты',
    label: 'Повернуть на 15° по часовой',
    keys: ']',
    run: () => rotateSelectedObjectAction(15),
  },
  {
    group: 'Объекты',
    label: 'Повернуть на 15° против часовой',
    keys: '[',
    run: () => rotateSelectedObjectAction(-15),
  },
  {
    group: 'Объекты',
    label: 'Повернуть на 90° по часовой',
    keys: 'Shift+]',
    run: () => rotateSelectedObjectAction(90),
  },
  {
    group: 'Объекты',
    label: 'Повернуть на 90° против часовой',
    keys: 'Shift+[',
    run: () => rotateSelectedObjectAction(-90),
  },
  { group: 'Объекты', label: 'Сбросить поворот', keys: 'Alt+R', run: resetSelectedRotationAction },
  { group: 'Объекты', label: 'Сбросить масштаб', keys: 'Alt+S', run: resetSelectedScaleAction },

  { group: 'Кадры', label: 'Играть и пауза', keys: 'Enter', run: togglePlaybackAction },
  { group: 'Кадры', label: 'Предыдущий кадр', keys: ',', run: () => stepFrameAction(-1) },
  { group: 'Кадры', label: 'Следующий кадр', keys: '.', run: () => stepFrameAction(1) },

  { group: 'Вид', label: 'Приблизить', keys: '+', run: () => zoomByAction(1.25) },
  { group: 'Вид', label: 'Приблизить', keys: '=', hidden: true, run: () => zoomByAction(1.25) },
  { group: 'Вид', label: 'Отдалить', keys: '-', run: () => zoomByAction(0.8) },
  { group: 'Вид', label: 'Вписать в окно', keys: '0', run: fitViewAction },
  {
    group: 'Вид',
    label: 'Сетка',
    keys: '`',
    run: () => editor().setShowGrid(!editor().showGrid),
  },
  {
    group: 'Вид',
    label: 'Шахматка под прозрачным холстом',
    keys: '~',
    run: () => editor().setShowChecker(!editor().showChecker),
  },
  {
    group: 'Файл',
    label: 'Размер холста',
    keys: 'Ctrl+Alt+C',
    run: () => useUiStore.getState().setResizeOpen(true),
  },
  {
    group: 'Вид',
    label: 'Справка по клавишам',
    keys: '?',
    run: () => useUiStore.getState().setHotkeysOpen(true),
  },

  // Обмен цветов объявлен до инструментов: иначе его перехватил бы инструмент с клавишей X.
  {
    group: 'Инструменты',
    label: 'Поменять цвета местами',
    keys: 'X',
    run: () => editor().swapColors(),
  },
  {
    group: 'Инструменты',
    label: 'Поменять кисти местами',
    keys: 'Shift+X',
    run: () => editor().swapBrushes(),
  },
  {
    group: 'Инструменты',
    label: 'Кисть левой или правой кнопки',
    keys: 'B',
    run: () => editor().setActiveBrush(editor().activeBrush === 0 ? 1 : 0),
  },
];

/** Сочетания инструментов берутся из самого списка инструментов, чтобы не разойтись с ним. */
const TOOL_HOTKEYS: readonly Hotkey[] = TOOLS.map((tool) => ({
  group: 'Инструменты' as const,
  label: tool.label,
  keys: tool.hotkey.toUpperCase(),
  run: () => editor().setTool(tool.id),
}));

export const HOTKEYS: readonly Hotkey[] = [...STATIC_HOTKEYS, ...TOOL_HOTKEYS];

/**
 * Самое уверенное совпадение. Порядок объявления решает только при равной уверенности, поэтому
 * добавление новой записи не может втихую перехватить чужое сочетание.
 */
export function findHotkey(event: KeyChord): Hotkey | null {
  let best: Hotkey | null = null;
  let bestQuality: MatchQuality = MatchQuality.None;
  for (const hotkey of HOTKEYS) {
    const quality = matchQuality(hotkey.keys, event);
    if (quality > bestQuality) {
      best = hotkey;
      bestQuality = quality;
      if (quality === MatchQuality.PhysicalKey) break;
    }
  }
  return best;
}

export const HOTKEY_GROUPS: readonly HotkeyGroup[] = [
  'Инструменты',
  'Правка',
  'Объекты',
  'Кадры',
  'Вид',
  'Файл',
];
