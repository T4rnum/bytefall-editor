import {
  copySelectionAction,
  cutSelectionAction,
  deleteSelectionAction,
  pasteAction,
  selectAllAction,
} from '../store/clipboardActions';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { openDocumentAction, saveDocumentAction } from '../store/fileActions';
import { stepFrameAction, togglePlaybackAction } from '../store/frameActions';
import {
  duplicateSelectedObjectAction,
  groupSelectionAction,
  ungroupSelectedObjectAction,
} from '../store/objectActions';
import { useUiStore } from '../store/uiStore';
import { fitViewAction, zoomByAction } from '../store/viewActions';
import { TOOLS, getTool } from '../tools';
import { buildToolEnv } from '../tools/env';

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

/**
 * Разбирает «Ctrl+Shift+S» в проверку события. Одна запись служит и поведением, и подписью,
 * поэтому справка не может разойтись с тем, что происходит на самом деле.
 *
 * Совпадение по модификаторам точное: Ctrl+Z и Ctrl+Shift+Z — разные сочетания, и порядок
 * объявления на них не влияет.
 */
export function matchesCombo(spec: string, event: KeyboardEvent): boolean {
  const parts = spec.split('+');
  // Само сочетание «+» даёт при разборе пустой хвост.
  const rawKey = parts[parts.length - 1] === '' ? '+' : parts[parts.length - 1];
  const mods = parts.slice(0, -1).filter((p) => p !== '');

  const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const wanted = rawKey.length === 1 ? rawKey.toLowerCase() : rawKey;
  if (pressed !== wanted) return false;
  // Cmd на macOS работает как Ctrl.
  if (mods.includes('Ctrl') !== (event.ctrlKey || event.metaKey)) return false;
  if (mods.includes('Shift') !== event.shiftKey) return false;
  if (mods.includes('Alt') !== event.altKey) return false;
  return true;
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
  { group: 'Файл', label: 'Открыть', keys: 'Ctrl+O', run: () => void openDocumentAction() },
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
  { group: 'Правка', label: 'Вырезать', keys: 'Ctrl+X', run: cutSelectionAction },
  { group: 'Правка', label: 'Копировать', keys: 'Ctrl+C', run: copySelectionAction },
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
];

/** Сочетания инструментов берутся из самого списка инструментов, чтобы не разойтись с ним. */
const TOOL_HOTKEYS: readonly Hotkey[] = TOOLS.map((tool) => ({
  group: 'Инструменты' as const,
  label: tool.label,
  keys: tool.hotkey.toUpperCase(),
  run: () => editor().setTool(tool.id),
}));

export const HOTKEYS: readonly Hotkey[] = [...STATIC_HOTKEYS, ...TOOL_HOTKEYS];

/** Первое подходящее сочетание. null, если ничего не подошло. */
export function findHotkey(event: KeyboardEvent): Hotkey | null {
  return HOTKEYS.find((hotkey) => matchesCombo(hotkey.keys, event)) ?? null;
}

export const HOTKEY_GROUPS: readonly HotkeyGroup[] = [
  'Инструменты',
  'Правка',
  'Объекты',
  'Кадры',
  'Вид',
  'Файл',
];
