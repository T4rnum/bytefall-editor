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

  // «Shift+]» записан явно: сверяется физическая клавиша с зажатым Shift, какой бы символ
  // она ни печатала на текущей раскладке.
  const plain = PUNCTUATION_CODES[rawKey];
  if (plain !== undefined && event.code === plain && event.shiftKey === wantShift) {
    return MatchQuality.PhysicalKey;
  }
  const shifted = SHIFTED_PUNCTUATION_CODES[rawKey];
  if (shifted !== undefined && event.code === shifted && event.shiftKey) {
    return MatchQuality.PhysicalKey;
  }
  // Явный Shift в записи обязателен и здесь: «Shift+]» не должно срабатывать на простую «]».
  const shiftOk = !wantShift || event.shiftKey;
  return event.key === rawKey && shiftOk ? MatchQuality.Character : MatchQuality.None;
}

/** Совпало ли сочетание вообще, без учёта уверенности. */
export function matchesCombo(spec: string, event: KeyChord): boolean {
  return matchQuality(spec, event) !== MatchQuality.None;
}
