import { type Animation, createAnimation } from '../animation';
import { type Cell, makeCell } from '../cell';
import {
  type Document,
  type Layer,
  MAX_DIMENSION,
  MAX_LAYERS,
  createDocument,
  createLayer,
} from '../document';
import { type CellKey, keyOf } from '../grid';
import { DocumentFormatError } from '../serialization';
import { cp437Glyph } from './cp437';

/** Байт на ячейку: код символа int32 плюс цвет символа и цвет фона по три байта. */
const CELL_BYTES = 10;

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

interface XpLayer {
  readonly width: number;
  readonly height: number;
  readonly cells: Map<CellKey, Cell>;
}

/** Читает int32 little-endian и сдвигает позицию. Обрезанный файл — ошибка, а не нули. */
function reader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  return {
    get offset() {
      return offset;
    },
    int(): number {
      if (offset + 4 > bytes.length) throw new DocumentFormatError('Файл .xp обрезан');
      const value = view.getInt32(offset, true);
      offset += 4;
      return value;
    },
    need(count: number): void {
      if (offset + count > bytes.length) throw new DocumentFormatError('Файл .xp обрезан');
    },
    skip(count: number): void {
      offset += count;
    },
    view,
  };
}

function readLayer(bytes: Uint8Array, read: ReturnType<typeof reader>): XpLayer {
  const width = read.int();
  const height = read.int();
  if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new DocumentFormatError(`Слой .xp размером ${width}×${height} не поддерживается`);
  }
  read.need(width * height * CELL_BYTES);
  const cells = new Map<CellKey, Cell>();
  // REXPaint пишет ячейки по столбцам: x снаружи, y внутри.
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const o = read.offset;
      const glyph = cp437Glyph(read.view.getInt32(o, true));
      const [fr, fg, fb, br, bg, bb] = bytes.subarray(o + 4, o + CELL_BYTES);
      read.skip(CELL_BYTES);
      // Пурпурный фон 255,0,255 у REXPaint значит «прозрачно».
      const transparent = br === 255 && bg === 0 && bb === 255;
      if (glyph === '' && transparent) continue;
      cells.set(
        keyOf(x, y),
        makeCell(glyph, toHex(fr, fg, fb), transparent ? null : toHex(br, bg, bb)),
      );
    }
  }
  return { width, height, cells };
}

/**
 * Изображение REXPaint (`.xp`) — уже распакованное из gzip. Слои REXPaint становятся слоями
 * документа снизу вверх, символы переводятся из CP437 в Unicode. Холст прозрачный: у REXPaint
 * прозрачность задаётся цветом фона ячейки, и без фона она должна остаться прозрачной.
 *
 * Файлы новее версии 1.02 начинаются с отрицательного номера версии, старые — сразу с числа
 * слоёв; читаются и те, и другие.
 */
export function parseXp(bytes: Uint8Array, name: string): Animation {
  const read = reader(bytes);
  const first = read.int();
  const layerCount = first < 0 ? read.int() : first;
  if (layerCount < 1 || layerCount > MAX_LAYERS) {
    throw new DocumentFormatError(`В файле .xp неверное число слоёв: ${layerCount}`);
  }
  const xpLayers: XpLayer[] = [];
  for (let i = 0; i < layerCount; i++) xpLayers.push(readLayer(bytes, read));

  // Слои REXPaint одного размера, но недоверенный файл проверяется: берётся наибольший.
  const width = Math.max(...xpLayers.map((l) => l.width));
  const height = Math.max(...xpLayers.map((l) => l.height));
  const layers: Layer[] = xpLayers.map((l, i) => ({
    ...createLayer(`Слой ${i + 1}`),
    cells: l.cells,
  }));
  const doc: Document = {
    ...createDocument({ name, width, height, background: null }),
    layers,
  };
  return createAnimation(doc);
}
