import { describe, expect, it } from 'vitest';
import type { RgbaImage } from '../quantize';
import { RELIEF_GRID, reliefParts } from '../scene3d/relief';

/** Картинка по функции от точки: [r, g, b, a] байтами. */
function image(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

const zAt = (positions: Float32Array, w: number, x: number, y: number): number =>
  positions[(y * w + x) * 3 + 2];

describe('3D-рельеф из картинки', () => {
  it('по яркости: светлое выше тёмного, цвета вершин — цвета картинки', () => {
    const ramp = image(8, 4, (x) => (x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const [part] = reliefParts(ramp, 'brightness');
    expect(part.positions).toHaveLength(8 * 4 * 3);
    // 7 × 3 квадрата, по два треугольника.
    expect(part.indices).toHaveLength(7 * 3 * 6);
    expect(zAt(part.positions, 8, 7, 1)).toBeGreaterThan(zAt(part.positions, 8, 0, 1));
    expect([...part.colors!.slice(0, 3)]).toEqual([0, 0, 0]);
    expect([...part.colors!.slice(7 * 3, 7 * 3 + 3)]).toEqual([1, 1, 1]);
    // На склоне вправо вверх нормаль смотрит влево, к камере — всегда.
    const n = (4 * 8 + 3 - 8) * 3;
    expect(part.normals[n]).toBeLessThan(0);
    expect(part.normals[n + 2]).toBeGreaterThan(0);
    // Верх картинки — вверху сцены.
    expect(part.positions[1]).toBeGreaterThan(part.positions[3 * 8 * 3 + 1]);
  });

  it('прозрачное в сетку не попадает, совсем прозрачная картинка — без частей', () => {
    const corner = image(3, 3, (x, y) => (x === 0 && y === 0 ? [0, 0, 0, 0] : [9, 9, 9, 255]));
    const [part] = reliefParts(corner, 'brightness');
    // Из четырёх квадратов остаются три: у первого угол прозрачный.
    expect(part.indices).toHaveLength(3 * 6);
    expect([...part.indices]).not.toContain(0);
    expect(
      reliefParts(
        image(4, 4, () => [255, 0, 0, 0]),
        'inflate',
      ),
    ).toEqual([]);
  });

  it('подушкой: край силуэта на нуле, середина выше всего, форма симметрична', () => {
    const square = image(9, 9, () => [200, 100, 50, 255]);
    const [part] = reliefParts(square, 'inflate');
    const z = (x: number, y: number) => zAt(part.positions, 9, x, y);
    expect(z(0, 0)).toBe(0);
    expect(z(0, 4)).toBe(0);
    expect(z(4, 4)).toBeGreaterThan(z(2, 4));
    expect(z(2, 4)).toBeGreaterThan(z(1, 4));
    expect(z(2, 4)).toBeCloseTo(z(6, 4), 6);
    expect(z(4, 2)).toBeCloseTo(z(4, 6), 6);
    // Цвет — с картинки, как есть.
    expect(part.colors![0]).toBeCloseTo(200 / 255, 6);
  });

  it('большая картинка ужимается до сетки RELIEF_GRID по большей стороне', () => {
    const [part] = reliefParts(
      image(512, 256, () => [10, 20, 30, 255]),
      'brightness',
    );
    expect(part.positions.length / 3).toBe(RELIEF_GRID * (RELIEF_GRID / 2));
    // Середина рельефа — в начале координат.
    const xs = part.positions.filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs), 6);
  });
});
