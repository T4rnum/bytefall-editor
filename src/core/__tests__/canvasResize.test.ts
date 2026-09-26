import { describe, expect, it } from 'vitest';
import { canvasHandleAt, canvasHandleCursor, dragCanvas } from '../canvasResize';
import { MAX_DIMENSION, createDocument, resizeDocument, resizeOffset } from '../document';

describe('размер холста за край', () => {
  it('угол ловится у вершины, край — по всей длине, середина холста — ничто', () => {
    expect(canvasHandleAt(20, 10, { x: 0.2, y: -0.1 }, 0.5)).toBe('nw');
    expect(canvasHandleAt(20, 10, { x: 20.3, y: 10.2 }, 0.5)).toBe('se');
    expect(canvasHandleAt(20, 10, { x: 7, y: 9.8 }, 0.5)).toBe('s');
    expect(canvasHandleAt(20, 10, { x: -0.4, y: 3 }, 0.5)).toBe('w');
    expect(canvasHandleAt(20, 10, { x: 10, y: 5 }, 0.5)).toBeNull();
    expect(canvasHandleAt(20, 10, { x: 25, y: 0 }, 0.5)).toBeNull();
  });

  it('левый край наружу растит холст влево: якорь справа, рамка левее нуля', () => {
    expect(dragCanvas(20, 10, 'w', -3, 7)).toEqual({
      width: 23,
      height: 10,
      anchor: 'right',
      rect: { x: -3, y: 0, w: 23, h: 10 },
    });
  });

  it('угол тянет две стороны, внутрь — обрезает, пределы формата держатся', () => {
    expect(dragCanvas(20, 10, 'ne', -4, 2)).toMatchObject({
      width: 16,
      height: 8,
      anchor: 'bottom-left',
      rect: { x: 0, y: 2, w: 16, h: 8 },
    });
    expect(dragCanvas(20, 10, 's', 0, -50).height).toBe(1);
    expect(dragCanvas(20, 10, 'e', 5000, 0).width).toBe(MAX_DIMENSION);
  });

  it('якорь совпадает с тем, что делает изменение размера: рисунок стоит на месте', () => {
    const doc = createDocument({ width: 20, height: 10 });
    const { width, height, anchor, rect } = dragCanvas(20, 10, 'nw', -2, -5);
    expect(resizeOffset(doc, width, height, anchor)).toEqual({ x: -rect.x, y: -rect.y });
    expect(resizeDocument(doc, width, height, anchor)).toMatchObject({ width: 22, height: 15 });
  });

  it('курсор по направлению ручки', () => {
    expect(canvasHandleCursor('n')).toBe('ns-resize');
    expect(canvasHandleCursor('w')).toBe('ew-resize');
    expect(canvasHandleCursor('se')).toBe('nwse-resize');
    expect(canvasHandleCursor('ne')).toBe('nesw-resize');
  });
});
