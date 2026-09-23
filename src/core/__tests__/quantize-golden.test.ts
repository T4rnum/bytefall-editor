import { describe, expect, it } from 'vitest';
import { DEFAULT_QUANTIZE, type QuantizeOptions, imageToCells } from '../quantize';
import { cellsToText, disk, gradient, makeImage } from './helpers/images';

/**
 * Золотые снимки конвертера: синтетические картинки, чтобы снимок не зависел от файлов и
 * декодеров. Меняется правило выбора символа — меняется снимок, и это видно в диффе.
 */
const snapshot = (name: string): string => `./golden/quantize-${name}.txt`;

const text = (image: ReturnType<typeof makeImage>, cells: number, options: QuantizeOptions) => {
  const result = imageToCells(image, cells, options);
  return cellsToText(result.cells, result.width, result.height);
};

describe('золотые снимки конвертера', () => {
  it('градиент без дизеринга: ровные ступени рампы', async () => {
    const out = text(gradient(160, 32), 40, { ...DEFAULT_QUANTIZE, dither: 'none' });
    await expect(out).toMatchFileSnapshot(snapshot('gradient'));
  });

  it('градиент с Байером: ступени перемешаны без полос', async () => {
    const out = text(gradient(160, 32), 40, { ...DEFAULT_QUANTIZE, dither: 'bayer' });
    await expect(out).toMatchFileSnapshot(snapshot('gradient-bayer'));
  });

  it('круг с контурами: заливка рампой, край — чертами по направлению', async () => {
    const out = text(disk(96), 24, { ...DEFAULT_QUANTIZE, dither: 'none', edges: true });
    await expect(out).toMatchFileSnapshot(snapshot('disk-edges'));
  });

  it('круг на светлом холсте: инверсия делает фон плотным, круг пустым', async () => {
    const out = text(disk(64), 16, { ...DEFAULT_QUANTIZE, dither: 'none', invert: true });
    await expect(out).toMatchFileSnapshot(snapshot('disk-inverted'));
  });
});
