import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { composite } from '../compositor';
import { createDocument, setLayerCells } from '../document';
import { applyEdits, emptyGrid, keyOf } from '../grid';
import { fitThumbnail, renderThumbnail } from '../thumbnail';

/** Документ с заданными ячейками на первом слое. */
function docWith(
  width: number,
  height: number,
  cells: [number, number, ReturnType<typeof makeCell>][],
  background: string | null = null,
) {
  const doc = createDocument({ width, height, background });
  const edits = new Map(cells.map(([x, y, cell]) => [keyOf(x, y), cell]));
  return setLayerCells(doc, doc.layers[0].id, applyEdits(emptyGrid(), edits));
}

const pixel = (data: Uint8ClampedArray, width: number, x: number, y: number) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));

const solid = () => 1;

describe('fitThumbnail', () => {
  it('вписывает холст в рамку с сохранением пропорций', () => {
    expect(fitThumbnail(64, 32, 72, 36)).toEqual({ width: 72, height: 36 });
    expect(fitThumbnail(32, 64, 72, 36)).toEqual({ width: 18, height: 36 });
    expect(fitThumbnail(1024, 1, 72, 36)).toEqual({ width: 72, height: 1 });
  });
});

describe('renderThumbnail', () => {
  it('символ, закрашивающий ячейку целиком, даёт её цвет', () => {
    const doc = docWith(1, 1, [[0, 0, makeCell('█', '#ff0000')]]);
    const thumb = renderThumbnail(composite(doc), 1, 1, doc.background, solid);
    expect(pixel(thumb.data, 1, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it('символ входит в цвет по доле закраски', () => {
    const doc = docWith(1, 1, [[0, 0, makeCell('#', '#ffffff', '#000000')]]);
    const thumb = renderThumbnail(composite(doc), 1, 1, null, () => 0.5);
    const [r, g, b, a] = pixel(thumb.data, 1, 0, 0);
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(135);
    expect(g).toBe(r);
    expect(b).toBe(r);
  });

  it('пустой прозрачный холст прозрачен, а с фоном — цвета фона', () => {
    const doc = docWith(2, 2, []);
    const clear = renderThumbnail(composite(doc), 2, 2, null, solid);
    expect(pixel(clear.data, 2, 1, 1)[3]).toBe(0);
    const paper = renderThumbnail(composite(doc), 2, 2, '#204060', solid);
    expect(pixel(paper.data, 2, 1, 1)).toEqual([32, 64, 96, 255]);
  });

  it('при сжатии прозрачные ячейки не тянут цвет к чёрному, а только разбавляют альфу', () => {
    const doc = docWith(4, 1, [[0, 0, makeCell('█', '#ff0000')]]);
    const thumb = renderThumbnail(composite(doc), 1, 1, null, solid);
    const [r, g, b, a] = pixel(thumb.data, 1, 0, 0);
    expect([r, g, b]).toEqual([255, 0, 0]);
    expect(a).toBeGreaterThan(60);
    expect(a).toBeLessThan(68);
  });

  it('при растяжении ячейка занимает несколько пикселей целиком', () => {
    const doc = docWith(2, 1, [[1, 0, makeCell('█', '#00ff00')]]);
    const thumb = renderThumbnail(composite(doc), 4, 2, '#000000', solid);
    expect(pixel(thumb.data, 4, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(thumb.data, 4, 1, 1)).toEqual([0, 0, 0, 255]);
    expect(pixel(thumb.data, 4, 2, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(thumb.data, 4, 3, 1)).toEqual([0, 255, 0, 255]);
  });

  it('спрашивает долю закраски один раз на символ, а не на ячейку', () => {
    const cells: [number, number, ReturnType<typeof makeCell>][] = [];
    for (let x = 0; x < 8; x++) cells.push([x, 0, makeCell('#', '#ffffff')]);
    const doc = docWith(8, 1, cells);
    let calls = 0;
    renderThumbnail(composite(doc), 8, 1, null, () => {
      calls += 1;
      return 0.4;
    });
    expect(calls).toBe(1);
  });
});
