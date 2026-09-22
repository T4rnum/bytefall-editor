import { describe, it } from 'vitest';
import { composite } from '../compositor';
import { fitThumbnail, renderThumbnail } from '../thumbnail';
import { BENCH_SIZES, benchDocument } from './fixtures';

/**
 * Миниатюра кадра. Сборка кадра меряется в `composite.bench.ts`, здесь — только сжатие готового
 * буфера в картинку: 72×36 на обычном экране и вдвое больше на экране с плотностью 2.
 */
for (const size of BENCH_SIZES) {
  const doc = benchDocument(size);
  const buffer = composite(doc);
  const coverage = (glyph: string): number => (glyph === ' ' ? 0 : 0.4);
  const normal = fitThumbnail(size.width, size.height, 72, 36);
  const retina = fitThumbnail(size.width, size.height, 144, 72);

  describe(`thumbnail ${size.label}`, () => {
    it('сжатие кадра в миниатюру', async ({ bench }) => {
      await bench.compare(
        bench(`${normal.width}×${normal.height}`, () => {
          renderThumbnail(buffer, normal.width, normal.height, doc.background, coverage);
        }),
        bench(`${retina.width}×${retina.height}`, () => {
          renderThumbnail(buffer, retina.width, retina.height, doc.background, coverage);
        }),
      );
    });
  });
}
