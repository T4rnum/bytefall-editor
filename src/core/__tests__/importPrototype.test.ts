import { describe, expect, it } from 'vitest';
import { frameDocument } from '../animation';
import { getCell } from '../grid';
import { PROTOTYPE_DEFAULT_SIZE, isPrototypeFile, parsePrototype } from '../import/prototype';
import { deserialize, serialize } from '../serialization';

/** Файл первого прототипа: у каждого кадра свои слои, ячейки парами «x,y» — данные. */
const sample = [
  {
    id: 'frame-1',
    layers: [
      {
        id: 'layer-1',
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        data: [
          ['0,0', { char: '@', color: '#ff0000' }],
          // Стёртая ячейка: прототип хранил её пустыми строками.
          ['1,0', { char: '', color: '' }],
          ['2,0', { char: '#', color: '#00ff00', bgColor: '#000080' }],
          // За пределом холста по умолчанию и с негодным цветом.
          ['60,3', { char: 'x', color: 'red' }],
          ['junk', { char: 'z', color: '#ffffff' }],
          // Пробел с фоном — ячейка только с фоном.
          ['3,3', { char: ' ', color: '#ffffff', bgColor: '#123456' }],
        ],
      },
      { id: 'layer-2', name: 'Top', visible: false, opacity: 0.5, data: [] },
    ],
  },
  {
    id: 'frame-2',
    layers: [
      {
        id: 'layer-2',
        name: 'Top',
        visible: false,
        opacity: 0.5,
        data: [['5,5', { char: 'Q', color: '#ffffff' }]],
      },
      { id: 'layer-3', name: 'Extra', visible: true, opacity: 1, data: [] },
    ],
  },
];

describe('parsePrototype', () => {
  it('узнаёт файл прототипа по массиву кадров', () => {
    expect(isPrototypeFile(sample)).toBe(true);
    expect(isPrototypeFile({ version: 4 })).toBe(false);
  });

  it('сводит слои кадров в общий список по id в порядке появления', () => {
    const anim = parsePrototype(sample, 'old');
    const first = frameDocument(anim, 0);
    expect(first.layers.map((l) => l.name)).toEqual(['Layer 1', 'Top', 'Extra']);
    expect(first.layers[1]).toMatchObject({ visible: false, opacity: 0.5 });
    expect(anim.frames).toHaveLength(2);
    // Во втором кадре нет первого слоя — он там пуст, но есть.
    const second = frameDocument(anim, 1);
    expect(second.layers[0].cells.size).toBe(0);
    expect(getCell(second.layers[1].cells, 5, 5)?.glyph).toBe('Q');
  });

  it('переносит ячейки и чинит то, что прототип писал небрежно', () => {
    const cells = frameDocument(parsePrototype(sample, 'old'), 0).layers[0].cells;
    expect(getCell(cells, 0, 0)).toEqual({ glyph: '@', fg: '#ff0000', bg: null });
    expect(getCell(cells, 1, 0)).toBeUndefined();
    expect(getCell(cells, 2, 0)).toEqual({ glyph: '#', fg: '#00ff00', bg: '#000080' });
    expect(getCell(cells, 60, 3)).toEqual({ glyph: 'x', fg: '#ffffff', bg: null });
    expect(getCell(cells, 3, 3)).toMatchObject({ glyph: '', bg: '#123456' });
    expect(cells.size).toBe(4);
  });

  it('холст не меньше прежнего по умолчанию и не меньше рисунка', () => {
    const anim = parsePrototype(sample, 'old');
    expect(anim.width).toBe(61);
    expect(anim.height).toBe(PROTOTYPE_DEFAULT_SIZE);
  });

  it('результат — обычный документ: сохраняется и открывается нашим форматом', () => {
    const anim = parsePrototype(sample, 'old');
    const reopened = deserialize(serialize(anim));
    expect(reopened.frames).toHaveLength(2);
    expect(getCell(frameDocument(reopened, 0).layers[0].cells, 2, 0)?.bg).toBe('#000080');
  });

  it('испорченный файл — понятная ошибка', () => {
    expect(() => parsePrototype([], 'empty')).toThrow(/прототипа/);
    expect(() => parsePrototype([{ nope: 1 }], 'bad')).toThrow(/прототипа/);
    expect(() => parsePrototype([{ layers: [{ data: [['0,0', { char: 1 }]] }] }], 'x')).toThrow(
      /прототипа/,
    );
  });
});
