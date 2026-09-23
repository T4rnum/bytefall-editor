import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { composite } from '../compositor';
import { createDocument, setLayerCells, updateLayer } from '../document';
import { createEffect } from '../effects';
import { applyEdits, editsFromPoints, emptyGrid, keyOf } from '../grid';
import { addObject, createObject, transformObject } from '../object';
import { bufferToText } from '../text';
import { tileLayout, tilesFromKeys } from '../tiles';

/** Буква «Г» из трёх ячеек: по ней видно направление поворота. */
const corner = () =>
  applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), makeCell('a')],
      [keyOf(1, 0), makeCell('b')],
      [keyOf(0, 1), makeCell('c')],
    ]),
  );

function sceneWith(patch: Parameters<typeof transformObject>[2]) {
  let doc = createDocument({ width: 6, height: 4 });
  const obj = createObject({
    name: 'corner',
    layerId: doc.layers[0].id,
    x: 2,
    y: 1,
    cells: corner(),
  });
  doc = transformObject(addObject(doc, obj), obj.id, patch);
  return { doc, id: obj.id };
}

/** Текстовый экспорт сцены построчно. */
const textOf = (patch: Parameters<typeof sceneWith>[0]): string[] =>
  bufferToText(composite(sceneWith(patch).doc)).split('\n');

describe('composite: объекты с трансформом', () => {
  it('в текст повёрнутый объект уходит так же, как при впечатывании: однозначно', () => {
    // Опора — центр рамки 2×2, то есть угол между ячейками: поворот переставляет их точно.
    expect(textOf({ rot: 90 })).toEqual(['', '  ca', '   b', '']);
    expect(textOf({ rot: 180 })).toEqual(['', '   c', '  ba', '']);
  });

  it('без поворота трансформ не меняет картинку, дробный сдвиг округляется', () => {
    expect(textOf({})).toEqual(['', '  ab', '  c', '']);
    expect(textOf({ rot: 360 })).toEqual(textOf({}));
    expect(textOf({ dx: 0.4 })).toEqual(textOf({}));
    expect(textOf({ dx: 0.6 })).toEqual(['', '   ab', '   c', '']);
  });

  it('на слое с эффектами свободный объект рисуется поверх результата эффектов', () => {
    const { doc } = sceneWith({ rot: 90 });
    const layerId = doc.layers[0].id;
    // Сплошной ряд под объектом и прокрутка, которая сдвинула бы объект, окажись он в сетке.
    const floor = editsFromPoints(
      [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 1 })),
      makeCell('='),
    );
    const scroll = { ...createEffect('scroll'), dx: 1, dy: 0, wrap: true };
    const fx = updateLayer(setLayerCells(doc, layerId, applyEdits(emptyGrid(), floor)), layerId, {
      effects: [scroll],
    });
    const text = bufferToText(composite(fx, null, undefined, [], 1000)).split('\n');
    expect(text[1]).toBe('==ca==');
    expect(text[2]).toBe('   b');
  });

  it('частичная пересборка тайлов совпадает с полной и для повёрнутого объекта', () => {
    let doc = createDocument({ width: 70, height: 40 });
    const obj = createObject({
      name: 'o',
      layerId: doc.layers[0].id,
      x: 30,
      y: 30,
      cells: corner(),
    });
    doc = transformObject(addObject(doc, obj), obj.id, { rot: 30, sx: 3, sy: 3 });
    const previous = composite(doc);
    const moved = transformObject(doc, obj.id, { rot: 60 });
    // Объект лежит на стыке четырёх тайлов 32×32: пересобираются все четыре.
    const corners = [keyOf(25, 25), keyOf(40, 25), keyOf(25, 39), keyOf(40, 39)];
    const tiles = tilesFromKeys(tileLayout(70, 40), corners);
    const full = composite(moved);
    const partial = composite(moved, null, previous, [], 0, tiles);
    expect(partial.glyphs).toEqual(full.glyphs);
    expect([...partial.fg]).toEqual([...full.fg]);
  });
});
