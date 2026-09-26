import { describe, expect, it } from 'vitest';
import { createDocument } from '../document';
import { addObject, createObject } from '../object';
import {
  existingSelection,
  rangeSelection,
  selectionRoots,
  toggleInSelection,
} from '../objectSelection';

/** a — корень, b — ребёнок a, c — ребёнок b, d — отдельный корень. */
function family() {
  let doc = createDocument({ width: 8, height: 8 });
  const layerId = doc.layers[0].id;
  const make = (id: string, parentId: string | null) => ({
    ...createObject({ name: id, id, layerId, x: 0, y: 0 }),
    parentId,
  });
  for (const [id, parent] of [
    ['a', null],
    ['b', 'a'],
    ['c', 'b'],
    ['d', null],
  ] as const) {
    doc = addObject(doc, make(id, parent));
  }
  return doc;
}

describe('выбор нескольких объектов', () => {
  it('переключение добавляет в конец, повторное — убирает', () => {
    expect(toggleInSelection(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInSelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('диапазон идёт по порядку списка, щёлкнутый становится главным', () => {
    const order = ['a', 'b', 'c', 'd'];
    expect(rangeSelection(order, 'a', 'c')).toEqual(['a', 'b', 'c']);
    expect(rangeSelection(order, 'd', 'b')).toEqual(['d', 'c', 'b']);
    expect(rangeSelection(order, null, 'b')).toEqual(['b']);
    expect(rangeSelection(order, 'x', 'b')).toEqual(['b']);
  });

  it('корни выбора: потомок выбранного предка не едет второй раз', () => {
    const doc = family();
    expect(selectionRoots(doc, ['c', 'a', 'd'])).toEqual(['a', 'd']);
    expect(selectionRoots(doc, ['b', 'c'])).toEqual(['b']);
  });

  it('пропавшие объекты уходят из выбора, порядок сохраняется', () => {
    expect(existingSelection(family(), ['d', 'zz', 'a'])).toEqual(['d', 'a']);
  });
});
