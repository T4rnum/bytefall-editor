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

/** То, что нужно от события клавиатуры. KeyboardEvent подходит структурно. */
export interface KeyChord {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const LETTER = /^[a-z]$/;
const DIGIT = /^[0-9]$/;

/**
 * Физические коды знаков препинания в незажатом виде. Нужны для раскладок, где на этой клавише
 * стоит другой символ: на русской, например, клавиша «`» печатает «ё».
 */
const PUNCTUATION_CODES: Readonly<Record<string, string>> = {
  '`': 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  ';': 'Semicolon',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
};

/**
 * Те же клавиши в нажатом с Shift виде. Нужны, когда на другой раскладке эта клавиша печатает
 * что-то своё: на русской Shift и «/» дают запятую, а не вопросительный знак.
 */
const SHIFTED_PUNCTUATION_CODES: Readonly<Record<string, string>> = {
  '?': 'Slash',
  '+': 'Equal',
  '~': 'Backquote',
  _: 'Minus',
  '<': 'Comma',
  '>': 'Period',
  ':': 'Semicolon',
};

/**
 * Насколько уверенно сочетание совпало с событием.
 *
 * Уверенность важна, потому что одно нажатие способно подойти сразу двум записям. На русской
 * раскладке Shift и клавиша «/» печатают запятую: это одновременно и «?» по физической клавише,
 * и «,» по символу. Побеждать должна физическая клавиша, иначе выбор зависел бы от порядка
 * объявления записей.
 */
export const enum MatchQuality {
  None = 0,
  /** Совпал напечатанный символ. Зависит от раскладки, поэтому слабее. */
  Character = 1,
  /** Совпала физическая клавиша. Раскладка на это не влияет. */
  PhysicalKey = 2,
}

/**
 * Разбирает «Ctrl+Shift+S» в проверку события. Одна запись служит и поведением, и подписью,
 * поэтому справка не может разойтись с тем, что происходит на самом деле.
 *
 * Буквы и цифры сверяются по физической клавише, а не по напечатанному символу: иначе Ctrl+Z
 * не работал бы на русской раскладке, где та же клавиша печатает «я».
 *
 * Знаки препинания сверяются и так, и так: по символу, потому что он уже учитывает Shift
 * («?» и «/» — одна клавиша, различает их только он), и по физической клавише, потому что на
 * другой раскладке нужный символ на ней может вовсе отсутствовать.
 */
export function matchQuality(spec: string, event: KeyChord): MatchQuality {
  const parts = spec.split('+');
  // Само сочетание «+» даёт при разборе пустой хвост.
  const rawKey = parts[parts.length - 1] === '' ? '+' : parts[parts.length - 1];
  const mods = parts.slice(0, -1).filter((p) => p !== '');

  // Cmd на macOS работает как Ctrl.
  if (mods.includes('Ctrl') !== (event.ctrlKey || event.metaKey)) return MatchQuality.None;
  if (mods.includes('Alt') !== event.altKey) return MatchQuality.None;

  const wantShift = mods.includes('Shift');
  const key = rawKey.toLowerCase();

  if (LETTER.test(key) || DIGIT.test(key)) {
    const code = LETTER.test(key) ? `Key${key.toUpperCase()}` : `Digit${key}`;
    const ok = event.code === code && wantShift === event.shiftKey;
    return ok ? MatchQuality.PhysicalKey : MatchQuality.None;
  }

  if (rawKey.length > 1) {
    // Именованные клавиши: Enter, Escape, Delete и подобные. Раскладка на них не влияет.
    const ok = event.key === rawKey && wantShift === event.shiftKey;
    return ok ? MatchQuality.PhysicalKey : MatchQuality.None;
  }

  const plain = PUNCTUATION_CODES[rawKey];
  if (plain !== undefined && event.code === plain && !event.shiftKey) {
    return MatchQuality.PhysicalKey;
  }
  const shifted = SHIFTED_PUNCTUATION_CODES[rawKey];
  if (shifted !== undefined && event.code === shifted && event.shiftKey) {
    return MatchQuality.PhysicalKey;
  }
  return event.key === rawKey ? MatchQuality.Character : MatchQuality.None;
}

/** Совпало ли сочетание вообще, без учёта уверенности. */
export function matchesCombo(spec: string, event: KeyChord): boolean {
  return matchQuality(spec, event) !== MatchQuality.None;
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
