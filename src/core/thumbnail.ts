import { parseHex } from './color';
import type { CellBuffer } from './compositor';

/** Картинка миниатюры: RGBA на пиксель, 0..255, без домножения на альфу — так её ждёт ImageData. */
export interface Thumbnail {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

/** Размер миниатюры, вписанной в рамку с сохранением пропорций холста. Не меньше пикселя. */
export function fitThumbnail(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Доля ячейки, которую закрашивает символ: 0 у пробела, около 1 у «█». */
export type GlyphCoverage = (glyph: string) => number;

/** Цвет, домноженный на альфу: в таком виде цвета складываются и усредняются честно. */
interface Premultiplied {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Средний цвет блока ячеек [x0, x1) × [y0, y1). Символ ложится поверх фона ячейки
 * с непрозрачностью, равной своей доле закраски. Пишет в `out`, чтобы не создавать объект
 * на каждый пиксель миниатюры.
 */
function averageBlock(
  buffer: CellBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  coverageOf: GlyphCoverage,
  out: Premultiplied,
): void {
  const { fg, bg, glyphs, width } = buffer;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      const o = i * 4;
      const ba = bg[o + 3];
      const glyph = glyphs[i];
      // У пустой ячейки плотность известна без поиска в таблице. Отдельной ветки «пропустить
      // ячейку» нет намеренно: на плотном холсте она плохо предсказывается и выходит дороже.
      const fa = glyph === '' ? 0 : fg[o + 3] * coverageOf(glyph);
      r += fg[o] * fa + bg[o] * ba * (1 - fa);
      g += fg[o + 1] * fa + bg[o + 1] * ba * (1 - fa);
      b += fg[o + 2] * fa + bg[o + 2] * ba * (1 - fa);
      a += fa + ba * (1 - fa);
    }
  }
  const count = (y1 - y0) * (x1 - x0);
  out.r = r / count;
  out.g = g / count;
  out.b = b / count;
  out.a = a / count;
}

/** Доли закраски считаются один раз на символ: символов в кадре мало, ячеек много. */
function memoizeCoverage(coverage: GlyphCoverage): GlyphCoverage {
  const known = new Map<string, number>();
  return (glyph) => {
    let value = known.get(glyph);
    if (value === undefined) {
      value = glyph === '' ? 0 : Math.min(1, Math.max(0, coverage(glyph)));
      known.set(glyph, value);
    }
    return value;
  };
}

/**
 * Миниатюра кадра. Пиксель миниатюры — среднее ячеек, которые под него попали; если пикселей
 * больше, чем ячеек, ячейка просто растягивается на несколько пикселей.
 *
 * Символ входит в цвет по доле пикселей, которые он закрашивает: точка почти не меняет фон,
 * а «█» закрашивает ячейку целиком. Форма символа на миниатюре всё равно не читается, а
 * плотность и цвет — ровно то, по чему кадры узнают.
 *
 * Усреднение идёт в домноженных на альфу цветах, иначе прозрачные ячейки тянули бы среднее
 * к чёрному. Фон холста подкладывается под результат; без фона миниатюра остаётся прозрачной.
 */
export function renderThumbnail(
  buffer: CellBuffer,
  width: number,
  height: number,
  background: string | null,
  coverage: GlyphCoverage,
): Thumbnail {
  const data = new Uint8ClampedArray(width * height * 4);
  const paper = background === null ? null : parseHex(background);
  const coverageOf = memoizeCoverage(coverage);
  const c: Premultiplied = { r: 0, g: 0, b: 0, a: 0 };

  for (let py = 0; py < height; py++) {
    const y0 = Math.floor((py * buffer.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((py + 1) * buffer.height) / height));
    for (let px = 0; px < width; px++) {
      const x0 = Math.floor((px * buffer.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((px + 1) * buffer.width) / width));
      averageBlock(buffer, x0, y0, x1, y1, coverageOf, c);
      if (paper) {
        c.r += paper.r * (1 - c.a);
        c.g += paper.g * (1 - c.a);
        c.b += paper.b * (1 - c.a);
        c.a = 1;
      }
      // Обратно из домноженных: ImageData хранит цвет и альфу раздельно.
      const o = (py * width + px) * 4;
      data[o] = c.a > 0 ? (c.r / c.a) * 255 : 0;
      data[o + 1] = c.a > 0 ? (c.g / c.a) * 255 : 0;
      data[o + 2] = c.a > 0 ? (c.b / c.a) * 255 : 0;
      data[o + 3] = c.a * 255;
    }
  }
  return { width, height, data };
}
