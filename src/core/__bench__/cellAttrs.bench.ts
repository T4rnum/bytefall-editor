import { describe, it } from 'vitest';
import type { Cell } from '../cell';
import { summarizeLayerAttrs } from '../cellAttrs';
import type { CellKey } from '../grid';
import { BENCH_SIZES, benchDocument } from './fixtures';

/**
 * Сводка свойств слоя. Панель свойств считает её, пока ничего не выделено, — а рисуют обычно
 * как раз без выделения, поэтому это цена каждого мазка и она обязана быть незаметной.
 */
for (const size of BENCH_SIZES) {
  const doc = benchDocument(size);
  const plain = doc.layers[doc.layers.length - 1].cells;
  // Каждая десятая ячейка помечена: так выглядит слой, размеченный под игру.
  const tagged = new Map<CellKey, Cell>();
  let i = 0;
  for (const [key, cell] of plain) {
    tagged.set(key, i++ % 10 === 0 ? { ...cell, attrs: { wall: true, hp: i % 7 } } : cell);
  }

  describe(`cell attrs ${size.label}`, () => {
    it('сводка свойств слоя', async ({ bench }) => {
      await bench.compare(
        bench('слой без свойств', () => {
          summarizeLayerAttrs(plain);
        }),
        bench('каждая десятая ячейка помечена', () => {
          summarizeLayerAttrs(tagged);
        }),
      );
    });
  });
}
