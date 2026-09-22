import { describe, expect, it } from 'vitest';
import { type KeyChord, findHotkey, matchesCombo } from '../registry';

/** Событие клавиатуры по умолчанию без модификаторов. */
const chord = (partial: Partial<KeyChord> & Pick<KeyChord, 'key' | 'code'>): KeyChord => ({
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...partial,
});

/** Латиница: клавиша Z печатает «z». */
const latinZ = (mods: Partial<KeyChord> = {}) =>
  chord({ key: mods.shiftKey ? 'Z' : 'z', code: 'KeyZ', ...mods });

/** Кириллица: та же физическая клавиша печатает «я». */
const cyrillicZ = (mods: Partial<KeyChord> = {}) =>
  chord({ key: mods.shiftKey ? 'Я' : 'я', code: 'KeyZ', ...mods });

describe('буквы не зависят от раскладки', () => {
  it('Ctrl+Z работает на латинице', () => {
    expect(matchesCombo('Ctrl+Z', latinZ({ ctrlKey: true }))).toBe(true);
  });

  it('Ctrl+Z работает на кириллице', () => {
    expect(matchesCombo('Ctrl+Z', cyrillicZ({ ctrlKey: true }))).toBe(true);
  });

  it('инструмент по клавише P срабатывает на кириллице', () => {
    // Клавиша P на русской раскладке печатает «з».
    expect(matchesCombo('P', chord({ key: 'з', code: 'KeyP' }))).toBe(true);
  });

  it('Cmd работает как Ctrl', () => {
    expect(matchesCombo('Ctrl+Z', latinZ({ metaKey: true }))).toBe(true);
  });
});

describe('Shift различает сочетания букв', () => {
  it('Ctrl+Z и Ctrl+Shift+Z не путаются', () => {
    const plain = latinZ({ ctrlKey: true });
    const shifted = latinZ({ ctrlKey: true, shiftKey: true });
    expect(matchesCombo('Ctrl+Z', plain)).toBe(true);
    expect(matchesCombo('Ctrl+Shift+Z', plain)).toBe(false);
    expect(matchesCombo('Ctrl+Z', shifted)).toBe(false);
    expect(matchesCombo('Ctrl+Shift+Z', shifted)).toBe(true);
  });

  it('порядок объявления не важен: совпадение точное', () => {
    const shifted = latinZ({ ctrlKey: true, shiftKey: true });
    const specs = ['Ctrl+Z', 'Ctrl+Shift+Z'];
    expect(specs.filter((s) => matchesCombo(s, shifted))).toEqual(['Ctrl+Shift+Z']);
  });

  it('Ctrl обязателен, если он в записи', () => {
    expect(matchesCombo('Ctrl+Z', latinZ())).toBe(false);
  });

  it('Alt не подходит вместо Ctrl', () => {
    expect(matchesCombo('Ctrl+Z', latinZ({ altKey: true }))).toBe(false);
  });
});

describe('знаки препинания', () => {
  it('«?» набирается с Shift и всё равно совпадает', () => {
    // Главный случай: на US-раскладке «?» это Shift и «/».
    expect(matchesCombo('?', chord({ key: '?', code: 'Slash', shiftKey: true }))).toBe(true);
  });

  it('«?» совпадает и на русской раскладке, где это Shift и «7»', () => {
    expect(matchesCombo('?', chord({ key: '?', code: 'Digit7', shiftKey: true }))).toBe(true);
  });

  it('«?» ловится по физической клавише, даже если она печатает другое', () => {
    // Русская раскладка: Shift и клавиша «/» дают запятую, а не вопросительный знак.
    expect(matchesCombo('?', chord({ key: ',', code: 'Slash', shiftKey: true }))).toBe(true);
  });

  it('та же клавиша без Shift вопросительным знаком не считается', () => {
    expect(matchesCombo('?', chord({ key: '.', code: 'Slash' }))).toBe(false);
  });

  it('«+» ловится по физической клавише на любой раскладке', () => {
    expect(matchesCombo('+', chord({ key: ';', code: 'Equal', shiftKey: true }))).toBe(true);
  });

  it('«/» без Shift не считается вопросительным знаком', () => {
    expect(matchesCombo('?', chord({ key: '/', code: 'Slash' }))).toBe(false);
  });

  it('«+» набирается с Shift и совпадает', () => {
    expect(matchesCombo('+', chord({ key: '+', code: 'Equal', shiftKey: true }))).toBe(true);
  });

  it('«`» совпадает по физической клавише на раскладке, где она печатает «ё»', () => {
    expect(matchesCombo('`', chord({ key: '`', code: 'Backquote' }))).toBe(true);
    expect(matchesCombo('`', chord({ key: 'ё', code: 'Backquote' }))).toBe(true);
  });

  it('«ё» с Shift не считается нажатием «`»', () => {
    expect(matchesCombo('`', chord({ key: 'Ё', code: 'Backquote', shiftKey: true }))).toBe(false);
  });

  it('запятая и точка работают на обеих раскладках', () => {
    expect(matchesCombo(',', chord({ key: ',', code: 'Comma' }))).toBe(true);
    // На русской раскладке запятая это Shift и та же клавиша, что точка.
    expect(matchesCombo(',', chord({ key: ',', code: 'Period', shiftKey: true }))).toBe(true);
    expect(matchesCombo('.', chord({ key: '.', code: 'Period' }))).toBe(true);
  });
});

describe('цифры и именованные клавиши', () => {
  it('цифра сверяется по физической клавише', () => {
    expect(matchesCombo('0', chord({ key: '0', code: 'Digit0' }))).toBe(true);
  });

  it('именованные клавиши сверяются по имени', () => {
    expect(matchesCombo('Escape', chord({ key: 'Escape', code: 'Escape' }))).toBe(true);
    expect(matchesCombo('Enter', chord({ key: 'Enter', code: 'Enter' }))).toBe(true);
    expect(matchesCombo('Delete', chord({ key: 'Delete', code: 'Delete' }))).toBe(true);
  });

  it('Escape с Shift не считается простым Escape', () => {
    expect(matchesCombo('Escape', chord({ key: 'Escape', code: 'Escape', shiftKey: true }))).toBe(
      false,
    );
  });
});

describe('выбор записи при нескольких совпадениях', () => {
  it('Shift и клавиша «/» на русской раскладке открывают справку, а не листают кадры', () => {
    // Такое нажатие печатает запятую, поэтому подходит и записи ',', и записи '?'.
    // Победить должна физическая клавиша, иначе выбор зависел бы от порядка объявления.
    const chord = {
      key: ',',
      code: 'Slash',
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    };
    expect(matchesCombo(',', chord)).toBe(true);
    expect(matchesCombo('?', chord)).toBe(true);
    expect(findHotkey(chord)?.label).toBe('Справка по клавишам');
  });

  it('обычная запятая по-прежнему листает кадры', () => {
    const chord = {
      key: ',',
      code: 'Comma',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    };
    expect(findHotkey(chord)?.label).toBe('Предыдущий кадр');
  });

  it('точка на русской раскладке листает кадры вперёд', () => {
    const chord = {
      key: '.',
      code: 'Period',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    };
    expect(findHotkey(chord)?.label).toBe('Следующий кадр');
  });

  it('Ctrl+Z на кириллице отменяет, а не выбирает инструмент', () => {
    const chord = {
      key: 'я',
      code: 'KeyZ',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
    };
    expect(findHotkey(chord)?.label).toBe('Отменить');
  });

  it('неизвестное нажатие ничего не находит', () => {
    const chord = {
      key: 'ф',
      code: 'KeyA',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    };
    expect(findHotkey(chord)).toBeNull();
  });
});
