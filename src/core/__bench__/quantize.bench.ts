import { describe, it } from 'vitest';
import { DEFAULT_QUANTIZE, PALETTE_PRESETS, quantize, sampleImage } from '../quantize';
import type { RgbaImage } from '../quantize';
import { type RenderBuffers, buffersToCells } from '../scene3d/render';
import { DEFAULT_QUANTIZE_3D } from '../scene3d/types';

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

/** Рендер 3D-сцены: шар на половину высоты кадра, два образца на сторону ячейки. */
function sphereRender(width: number, height: number): RenderBuffers {
  const sub = 2;
  const fw = width * sub;
  const fh = height * sub;
  const rgba = new Uint8Array(fw * fh * 4);
  const normal = new Float32Array(fw * fh * 3);
  const depth = new Float32Array(fw * fh).fill(1);
  const radius = fh / 4;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const nx = (x - fw / 2) / radius;
      const ny = (y - fh / 2) / radius;
      const nz2 = 1 - nx * nx - ny * ny;
      if (nz2 <= 0) continue;
      const i = y * fw + x;
      const nz = Math.sqrt(nz2);
      const light = Math.max(0, 0.5 * nx - 0.5 * ny + 0.7 * nz);
      rgba.set([255 * light, 120 * light, 80 * light, 255], i * 4);
      normal.set([nx, -ny, nz], i * 3);
      depth[i] = 0.5 - 0.2 * nz;
    }
  }
  return { width, height, sub, rgba, normal, depth };
}

const render256 = sphereRender(256, 144);
const render512 = sphereRender(512, 288);

describe('3D-слой', () => {
  it('рендер в символы на каждый кадр', async ({ bench }) => {
    await bench.compare(
      bench('256×144', () => {
        buffersToCells(render256, DEFAULT_QUANTIZE_3D);
      }),
      bench('512×288', () => {
        buffersToCells(render512, DEFAULT_QUANTIZE_3D);
      }),
    );
  });
});
