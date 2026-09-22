import { describe, it } from 'vitest';
import { floodFill, similarCells } from '../fill';
import type { Point } from '../geometry';
import { polygonCells } from '../polygon';
import { combineSelection, selectionFromPoints, selectionFromRect } from '../selection';
import { BENCH_SIZES, benchDocument } from './fixtures';

/**
 * Стоимость выделения. Прямоугольник строится на каждое движение указателя, поэтому он и есть
 * горячий путь: рамка во весь холст не должна стоить дороже кадра.
 *
 * Лассо и палочка считаются один раз за жест, но на большом холсте несмежная палочка обходит
 * весь слой, и это видно.
 */
for (const size of BENCH_SIZES) {
  const doc = benchDocument(size);
  const cells = doc.layers[doc.layers.length - 1].cells;
  const whole = { x: 0, y: 0, w: size.width, h: size.height };
  const half = { x: 0, y: 0, w: Math.floor(size.width / 2), h: Math.floor(size.height / 2) };

  // Замкнутый контур примерно в четверть холста: столько точек даёт обводка от руки.
  const loop: Point[] = [];
  const cx = size.width / 2;
  const cy = size.height / 2;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    loop.push({
      x: Math.round(cx + (size.width / 4) * Math.cos(a)),
      y: Math.round(cy + (size.height / 4) * Math.sin(a)),
    });
  }

  describe(`selection ${size.label}`, () => {
    it('построение', async ({ bench }) => {
      await bench.compare(
        bench('прямоугольник во весь холст', () => {
          selectionFromRect(whole, size.width, size.height);
        }),
        bench('прямоугольник в четверть холста', () => {
          selectionFromRect(half, size.width, size.height);
        }),
        bench('лассо: контур в 64 точки', () => {
          selectionFromPoints(polygonCells(loop, size.width, size.height), size.width, size.height);
        }),
      );
    });

    it('палочка', async ({ bench }) => {
      await bench.compare(
        bench('смежная область', () => {
          selectionFromPoints(
            floodFill(cells, size.width, size.height, 0, 0),
            size.width,
            size.height,
          );
        }),
        bench('все похожие ячейки слоя', () => {
          selectionFromPoints(
            similarCells(cells, size.width, size.height, 0, 0),
            size.width,
            size.height,
          );
        }),
      );
    });

    it('модификаторы', async ({ bench }) => {
      const base = selectionFromRect(whole, size.width, size.height);
      const part = selectionFromRect(half, size.width, size.height);
      await bench.compare(
        bench('Shift: объединение', () => {
          combineSelection(base, part, 'add');
        }),
        bench('Alt: вычитание с пересчётом габарита', () => {
          combineSelection(base, part, 'subtract');
        }),
      );
    });
  });
}
