/** Картинка: RGBA на пиксель, 0..255, строками сверху вниз, без домножения на альфу. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

/**
 * Картинка, сведённая к сетке ячеек. Дорогой проход по пикселям делается один раз на размер,
 * а всё остальное — яркость, рампа, дизеринг, цвета — считается по этим массивам на каждое
 * движение ползунка. Только типизированные массивы: такую структуру можно без копий отдать в
 * воркер (DESIGN.md, раздел 8).
 */
export interface CellSamples {
  /** Размер в ячейках. */
  readonly width: number;
  readonly height: number;
  /** Средний цвет ячейки: r, g, b долями 0..1, с весом по альфе, без домножения на неё. */
  readonly color: Float32Array;
  /** Доля непрозрачного в ячейке, 0..1. */
  readonly alpha: Float32Array;
  /** Сколько мелких образцов приходится на сторону ячейки. */
  readonly sub: number;
  /**
   * Яркость на сетке мельче ячеек, `sub` × `sub` образцов на ячейку, поверх чёрного: по ней ищутся
   * контуры. Размер — (width · sub) × (height · sub).
   */
  readonly fine: Float32Array;
}

/** Веса для мелкой сетки контуров: как видит глаз, Rec. 709. */
const FINE_WEIGHTS = [0.2126, 0.7152, 0.0722] as const;
/** Потолок мелкой сетки: 4 миллиона образцов, 16 МБ. Дальше образцов на ячейку становится меньше. */
const MAX_FINE_SAMPLES = 4 * 1024 * 1024;

/** Высота в ячейках при заданной ширине: ячейки квадратные, пропорции картинки сохраняются. */
export function cellsHighFor(image: { width: number; height: number }, cellsWide: number): number {
  return Math.max(1, Math.round((cellsWide * image.height) / image.width));
}

/** Образцов на сторону ячейки: четыре, пока мелкая сетка не упирается в потолок памяти. */
export function subsamplesFor(width: number, height: number): number {
  const fit = Math.floor(Math.sqrt(MAX_FINE_SAMPLES / (width * height)));
  return Math.max(1, Math.min(4, fit));
}

/** Границы пикселей, попадающих в образец `index` из `count` вдоль стороны длиной `size`. */
function span(index: number, count: number, size: number): [number, number] {
  const from = Math.floor((index * size) / count);
  const to = Math.max(from + 1, Math.floor(((index + 1) * size) / count));
  return [from, Math.min(size, to)];
}

/**
 * Усредняет картинку до сетки `width` × `height` ячеек. Каждый пиксель большой картинки
 * попадает ровно в один мелкий образец; маленькая картинка растягивается, и образец берёт
 * ближайший пиксель.
 */
export function sampleImage(image: RgbaImage, width: number, height: number): CellSamples {
  const sub = subsamplesFor(width, height);
  const fw = width * sub;
  const fh = height * sub;
  const fine = new Float32Array(fw * fh);
  // По ячейке: сумма цвета, домноженного на альфу, и сумма альфы по её мелким образцам.
  const sums = new Float32Array(width * height * 4);
  const { data } = image;
  for (let fy = 0; fy < fh; fy++) {
    const [y0, y1] = span(fy, fh, image.height);
    const cellRow = Math.floor(fy / sub) * width;
    for (let fx = 0; fx < fw; fx++) {
      const [x0, x1] = span(fx, fw, image.width);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let y = y0; y < y1; y++) {
        let o = (y * image.width + x0) * 4;
        for (let x = x0; x < x1; x++, o += 4) {
          const alpha = data[o + 3];
          r += data[o] * alpha;
          g += data[o + 1] * alpha;
          b += data[o + 2] * alpha;
          a += alpha;
        }
      }
      const n = (x1 - x0) * (y1 - y0) * 255;
      // Средний цвет образца, домноженный на альфу, долями 0..1.
      const pr = r / (n * 255);
      const pg = g / (n * 255);
      const pb = b / (n * 255);
      const pa = a / n;
      fine[fy * fw + fx] = FINE_WEIGHTS[0] * pr + FINE_WEIGHTS[1] * pg + FINE_WEIGHTS[2] * pb;
      const c = (cellRow + Math.floor(fx / sub)) * 4;
      sums[c] += pr;
      sums[c + 1] += pg;
      sums[c + 2] += pb;
      sums[c + 3] += pa;
    }
  }
  const color = new Float32Array(width * height * 3);
  const alpha = new Float32Array(width * height);
  const perCell = sub * sub;
  for (let i = 0; i < width * height; i++) {
    const a = sums[i * 4 + 3];
    alpha[i] = a / perCell;
    if (a <= 0) continue;
    color[i * 3] = sums[i * 4] / a;
    color[i * 3 + 1] = sums[i * 4 + 1] / a;
    color[i * 3 + 2] = sums[i * 4 + 2] / a;
  }
  return { width, height, color, alpha, sub, fine };
}
