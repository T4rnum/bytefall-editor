import { describe, expect, it } from 'vitest';
import { resizePreview } from '../resizePreview';

const square = { width: 10, height: 10 };

describe('resizePreview', () => {
  it('без изменения размера рамка совпадает с холстом', () => {
    const p = resizePreview(square, 10, 10, 'top-left');
    expect(p.canvas).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    expect(p.content).toEqual(p.canvas);
    expect(p.aspect).toBe(1);
    expect(p.kept).toEqual({ width: 10, height: 10 });
  });

  it('при росте содержимое занимает часть нового холста', () => {
    const p = resizePreview(square, 20, 10, 'left');
    expect(p.canvas).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    expect(p.content.left).toBe(0);
    expect(p.content.width).toBe(50);
    expect(p.kept).toEqual({ width: 10, height: 10 });
  });

  it('при обрезке часть содержимого торчит за рамкой холста и остаётся видимой', () => {
    const p = resizePreview(square, 5, 10, 'top-left');
    // Рамка — объединение: холст занимает левую половину, содержимое всю ширину.
    expect(p.canvas.width).toBe(50);
    expect(p.content.width).toBe(100);
    expect(p.kept).toEqual({ width: 5, height: 10 });
  });

  it('якорь переносит и содержимое, и обрезаемую часть на другую сторону', () => {
    const p = resizePreview(square, 5, 10, 'bottom-right');
    expect(p.canvas.left).toBe(50);
    expect(p.content.left).toBe(0);
    expect(p.kept).toEqual({ width: 5, height: 10 });
  });

  it('соотношение сторон берётся у объединения, а не у нового холста', () => {
    // Холст 5×10, содержимое уезжает вправо: объединение 10×10.
    expect(resizePreview(square, 5, 10, 'bottom-right').aspect).toBe(1);
    expect(resizePreview(square, 20, 10, 'left').aspect).toBe(2);
  });

  it('якорь не разводит содержимое и холст: пересечение есть всегда', () => {
    const anchors = ['top-left', 'top', 'center', 'right', 'bottom-right'] as const;
    for (const anchor of anchors) {
      const p = resizePreview({ width: 4, height: 4 }, 1, 1, anchor);
      expect(p.kept).toEqual({ width: 1, height: 1 });
    }
  });
});
