import { describe, expect, it } from 'vitest';
import { addFrame, createAnimation, frameDocument, resizeAnimation } from '../animation';
import { makeCell } from '../cell';
import { createDocument, setLayerCells } from '../document';
import { applyEdits, editsFromPoints, emptyGrid, getCell, keyOf } from '../grid';
import { type ConvertedImage, addImageLayer, imagePlacement, isDocumentEmpty } from '../imageLayer';

/** Картинка 4×2 из букв: по ним видно, куда она встала. */
const image: ConvertedImage = {
  name: 'кот',
  width: 4,
  height: 2,
  cells: applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), makeCell('A')],
      [keyOf(3, 1), makeCell('Z')],
    ]),
  ),
};

const twoFrames = () =>
  addFrame(createAnimation(createDocument({ width: 10, height: 6 })), 0, 'duplicate');

describe('addImageLayer', () => {
  it('новый слой во всех кадрах, символы — только в текущем, по центру холста', () => {
    const { animation, layerId } = addImageLayer(twoFrames(), 1, image, false);
    const current = frameDocument(animation, 1);
    const other = frameDocument(animation, 0);
    expect(current.layers.map((l) => l.name)).toEqual(['Слой 1', 'кот']);
    expect(other.layers.map((l) => l.id)).toEqual(current.layers.map((l) => l.id));
    const cells = current.layers.find((l) => l.id === layerId)!.cells;
    // Холст 10×6, картинка 4×2: по центру — с (3, 2).
    expect(getCell(cells, 3, 2)?.glyph).toBe('A');
    expect(getCell(cells, 6, 3)?.glyph).toBe('Z');
    expect(other.layers[1].cells.size).toBe(0);
    expect(imagePlacement({ width: 10, height: 6 }, image, false)).toEqual({ x: 3, y: 2 });
  });

  it('с подгонкой холст всех кадров становится размером с картинку, она встаёт в угол', () => {
    const { animation } = addImageLayer(twoFrames(), 0, image, true);
    expect([animation.width, animation.height]).toEqual([4, 2]);
    const cells = frameDocument(animation, 0).layers[1].cells;
    expect(getCell(cells, 0, 0)?.glyph).toBe('A');
    expect(getCell(cells, 3, 1)?.glyph).toBe('Z');
  });

  it('картинка больше холста обрезается, а не ломает документ', () => {
    const tiny = createAnimation(createDocument({ width: 2, height: 2 }));
    const { animation } = addImageLayer(tiny, 0, image, false);
    const cells = frameDocument(animation, 0).layers[1].cells;
    // Сдвиг (−1, 0): «A» уходит за левый край, «Z» — за правый.
    expect(cells.size).toBe(0);
  });

  it('пустой документ узнаётся, документ с рисунком — нет', () => {
    const empty = createAnimation(createDocument({ width: 4, height: 4 }));
    expect(isDocumentEmpty(empty)).toBe(true);
    const doc = createDocument({ width: 4, height: 4 });
    const drawn = setLayerCells(
      doc,
      doc.layers[0].id,
      applyEdits(emptyGrid(), editsFromPoints([{ x: 1, y: 1 }], makeCell('#'))),
    );
    expect(isDocumentEmpty(createAnimation(drawn))).toBe(false);
  });
});

describe('resizeAnimation', () => {
  it('сдвиг от якоря одинаков во всех кадрах', () => {
    const doc = createDocument({ width: 4, height: 4 });
    const drawn = setLayerCells(
      doc,
      doc.layers[0].id,
      applyEdits(emptyGrid(), editsFromPoints([{ x: 3, y: 3 }], makeCell('#'))),
    );
    const anim = addFrame(createAnimation(drawn), 0, 'duplicate');
    const resized = resizeAnimation(anim, 8, 8, 'bottom-right');
    for (let i = 0; i < resized.frames.length; i++) {
      expect(getCell(frameDocument(resized, i).layers[0].cells, 7, 7)?.glyph).toBe('#');
    }
    expect(resizeAnimation(resized, 8, 8)).toBe(resized);
  });
});
