import type { RgbaImage } from '../quantize';
import type { MeshPart3D } from './types';

/**
 * Картинка в 3D-рельеф: сетка вершин по пикселям, высота каждой — из картинки. Рельеф стоит в
 * плоскости XY лицом к камере по умолчанию, выпуклость идёт к ней, по +Z. Прозрачное в сетку не
 * попадает: у спрайта рельеф повторяет его силуэт.
 */
export type ReliefDepth = 'brightness' | 'inflate';

export const RELIEF_DEPTHS: readonly ReliefDepth[] = ['brightness', 'inflate'];

/** Точек сетки по большей стороне: 16 641 вершина, мельче ячейки кадра всё равно не видно. */
export const RELIEF_GRID = 128;
/** Размах высоты по яркости от ширины рельефа: выпукло, но не частоколом. */
const BRIGHTNESS_HEIGHT = 0.12;
/** Подушка: доля от круглого сечения — полностью круглая выглядит надутым шаром. */
const INFLATE_HEIGHT = 0.5;
/** Непрозрачная точка сетки — та, где картинки хотя бы половина. */
const OPAQUE = 0.5;

/** Картинка, усреднённая до сетки: цвет с весом по альфе и доля непрозрачного. */
interface Grid {
  readonly w: number;
  readonly h: number;
  readonly color: Float32Array;
  readonly alpha: Float32Array;
}

function downsample(image: RgbaImage): Grid {
  const k = Math.min(1, RELIEF_GRID / Math.max(image.width, image.height));
  const w = Math.max(2, Math.round(image.width * k));
  const h = Math.max(2, Math.round(image.height * k));
  const color = new Float32Array(w * h * 3);
  const alpha = new Float32Array(w * h);
  for (let gy = 0; gy < h; gy++) {
    const y0 = Math.floor((gy * image.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * image.height) / h));
    for (let gx = 0; gx < w; gx++) {
      const x0 = Math.floor((gx * image.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * image.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let y = y0; y < Math.min(y1, image.height); y++) {
        for (let x = x0; x < Math.min(x1, image.width); x++) {
          const o = (y * image.width + x) * 4;
          const pa = image.data[o + 3];
          r += image.data[o] * pa;
          g += image.data[o + 1] * pa;
          b += image.data[o + 2] * pa;
          a += pa;
        }
      }
      const i = gy * w + gx;
      alpha[i] = a / ((y1 - y0) * (x1 - x0) * 255);
      if (a === 0) continue;
      color.set([r / a / 255, g / a / 255, b / a / 255], i * 3);
    }
  }
  return { w, h, color, alpha };
}

/** Высота по яркости, как видит глаз, после лёгкого размытия: шум фото не станет иглами. */
function brightnessHeight({ w, h, color }: Grid): Float32Array {
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    luma[i] = 0.2126 * color[i * 3] + 0.7152 * color[i * 3 + 1] + 0.0722 * color[i * 3 + 2];
  }
  const out = new Float32Array(w * h);
  const scale = BRIGHTNESS_HEIGHT * Math.max(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          sum += luma[sy * w + sx];
          n++;
        }
      }
      out[y * w + x] = (sum / n) * scale;
    }
  }
  return out;
}

/**
 * Расстояние от каждой непрозрачной точки до прозрачного или края картинки, шагами сетки:
 * два прохода с ценой 3 по прямой и 4 по диагонали, близко к настоящему расстоянию.
 */
function distances({ w, h, alpha }: Grid): Float32Array {
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = alpha[i] >= OPAQUE ? Infinity : 0;
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x];
  const pass = (y: number, x: number, s: 1 | -1): void => {
    const i = y * w + x;
    if (d[i] === 0) return;
    d[i] = Math.min(
      d[i],
      at(x - s, y) + 3,
      at(x, y - s) + 3,
      at(x - s, y - s) + 4,
      at(x + s, y - s) + 4,
    );
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pass(y, x, 1);
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) pass(y, x, -1);
  return d.map((v) => v / 3);
}

/**
 * Подушка по силуэту: каждая точка поднимается по дуге круга, радиус которого — самое толстое
 * место фигуры. Край силуэта лежит на нуле, середина — выше всего.
 */
function inflateHeight(grid: Grid): Float32Array {
  const inside = distances(grid).map((v) => Math.max(0, v - 1));
  const radius = inside.reduce((m, v) => Math.max(m, v), 0);
  return inside.map((e) => Math.sqrt(e * (2 * radius - e)) * INFLATE_HEIGHT);
}

/** Нормаль по соседям; у края и рядом с прозрачным — разность в одну сторону. */
function normalsOf(grid: Grid, z: Float32Array): Float32Array {
  const { w, h, alpha } = grid;
  const normals = new Float32Array(w * h * 3);
  const height = (x: number, y: number, fallback: number): number =>
    x < 0 || y < 0 || x >= w || y >= h || alpha[y * w + x] < OPAQUE ? fallback : z[y * w + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = z[y * w + x];
      const dx = (height(x + 1, y, c) - height(x - 1, y, c)) / 2;
      // Строки картинки идут вниз, а ось Y сцены — вверх.
      const dy = (height(x, y - 1, c) - height(x, y + 1, c)) / 2;
      const len = Math.hypot(dx, dy, 1);
      normals.set([-dx / len, -dy / len, 1 / len], (y * w + x) * 3);
    }
  }
  return normals;
}

/** Треугольники квадратов сетки, у которых все четыре угла непрозрачны. */
function indicesOf({ w, h, alpha }: Grid): Uint32Array {
  const out: number[] = [];
  const solid = (i: number): boolean => alpha[i] >= OPAQUE;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = y * w + x;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      if (solid(a) && solid(b) && solid(c) && solid(d)) out.push(a, c, b, b, c, d);
    }
  }
  return Uint32Array.from(out);
}

/**
 * Рельеф картинки одной частью с цветами вершин. Размер — в шагах сетки, центр — в середине:
 * документу модель всё равно отдаётся через `normalizeParts`. Пустой список — в картинке нет
 * ни одного непрозрачного квадрата сетки.
 */
export function reliefParts(image: RgbaImage, depth: ReliefDepth): MeshPart3D[] {
  const grid = downsample(image);
  const indices = indicesOf(grid);
  if (indices.length === 0) return [];
  const { w, h } = grid;
  const z = depth === 'brightness' ? brightnessHeight(grid) : inflateHeight(grid);
  const positions = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      positions.set([x - (w - 1) / 2, (h - 1) / 2 - y, z[i]], i * 3);
    }
  }
  return [
    {
      positions,
      normals: normalsOf(grid, z),
      uvs: null,
      colors: grid.color,
      indices,
      color: '#ffffff',
      texture: null,
    },
  ];
}
