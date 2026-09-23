import { describe, it } from 'vitest';
import { DEFAULT_QUANTIZE, PALETTE_PRESETS, quantize, sampleImage } from '../quantize';
import type { RgbaImage } from '../quantize';

/**
 * Конвертер в диалоге импорта: дорогая часть — проход по пикселям (sampleImage) — идёт один раз
 * на ширину, дешёвая — выбор символов (quantize) — на каждое движение ползунка. Обе должны
 * укладываться в кадр, иначе предпросмотр будет дёргаться.
 */
function photo(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 7;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed >>> 24) - 128;
      const o = (y * width + x) * 4;
      data[o] = (x * 255) / width + noise * 0.2;
      data[o + 1] = (y * 255) / height + noise * 0.2;
      data[o + 2] = 128 + 100 * Math.sin((x + y) / 40) + noise * 0.1;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

const image = photo(1600, 1200);
const small = sampleImage(image, 160, 120);
const wide = sampleImage(image, 256, 192);
const pico = PALETTE_PRESETS[0].colors;

describe('конвертер изображений', () => {
  it('подготовка картинки 1600×1200', async ({ bench }) => {
    await bench.compare(
      bench('в 160×120 ячеек', () => {
        sampleImage(image, 160, 120);
      }),
      bench('в 256×192 ячеек', () => {
        sampleImage(image, 256, 192);
      }),
    );
  });

  it('выбор символов на каждое движение ползунка', async ({ bench }) => {
    await bench.compare(
      bench('160×120, Байер', () => {
        quantize(small, DEFAULT_QUANTIZE);
      }),
      bench('160×120, контуры и палитра', () => {
        quantize(small, { ...DEFAULT_QUANTIZE, edges: true, palette: pico });
      }),
      bench('256×192, контуры и палитра', () => {
        quantize(wide, { ...DEFAULT_QUANTIZE, edges: true, palette: pico });
      }),
    );
  });
});
