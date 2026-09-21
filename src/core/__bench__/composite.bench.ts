import { describe, it } from 'vitest';
import { type CellBuffer, composite, createCellBuffer } from '../compositor';
import { updateLayer } from '../document';
import { createEffect } from '../effects';
import { BENCH_SIZES, benchDocument, benchStroke } from './fixtures';

/**
 * Стоимость одного кадра на CPU. Это то, что выполняется на каждое движение указателя и на
 * каждый тик проигрывания, ещё до всякого GPU.
 *
 * Что здесь важно увидеть перед слоем 2 дорожной карты: composite пересобирает буфер целиком,
 * поэтому его стоимость растёт с площадью холста, а не с размером правки. Тайлы и грязные области
 * должны разорвать эту связь, и сравнивать результат надо именно с этими числами.
 */
for (const size of BENCH_SIZES) {
  const doc = benchDocument(size);
  const target: CellBuffer = createCellBuffer(size.width, size.height);
  const preview = { layerId: doc.layers[2].id, edits: benchStroke(size, 64) };
  const withFire = updateLayer(doc, doc.layers[0].id, { effects: [createEffect('fire', 'fx')] });

  describe(`composite ${size.label}`, () => {
    it('сборка кадра', async ({ bench }) => {
      await bench.compare(
        bench('кадр целиком', () => {
          composite(doc, null, target);
        }),
        bench('кадр с превью мазка в 64 ячейки', () => {
          composite(doc, preview, target);
        }),
        bench('кадр с эффектом огня', () => {
          composite(withFire, null, target, [], 500);
        }),
        bench('кадр без переиспользования буфера', () => {
          composite(doc);
        }),
      );
    });
  });
}
