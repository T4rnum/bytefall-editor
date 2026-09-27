import { type GlyphGroup, glyphGroups } from '../../core/font/charset';
import {
  BUILTIN_FONT,
  type DocumentFont,
  createUserFont,
  vectorCell,
  vectorLayout,
} from '../../core/font/font';
import { isSfnt, parseSfnt } from '../../core/font/sfnt';
import { TILESET_CHARS, isPng, tilesetCell, tilesetInk } from '../../core/font/tileset';
import { type GlyphPainter, tilesetPainter, vectorPainter } from './painters';

/** Встроенный шрифт. Файл лежит в public/fonts вместе с лицензией OFL. */
const BUILTIN_URL = `${import.meta.env.BASE_URL}fonts/PressStart2P-Regular.ttf`;

/**
 * Как показать символ шрифта в интерфейсе, вне холста: векторный — семейством CSS, лист —
 * маской по картинке листа белым по прозрачному.
 */
export type GlyphLook =
  | {
      readonly kind: 'family';
      readonly family: string;
      /** Кегль в пикселях шрифта и высота ячейки: по ним подбирается чёткий размер. */
      readonly size: number;
      readonly cellHeight: number;
    }
  | {
      readonly kind: 'sheet';
      readonly url: string;
      readonly cellWidth: number;
      readonly cellHeight: number;
    };

/** Загруженный шрифт документа: чем рисовать глифы и что показать в палитре символов. */
export interface LoadedFont {
  readonly font: DocumentFont;
  readonly painter: GlyphPainter;
  readonly groups: readonly GlyphGroup[];
  readonly look: GlyphLook;
}

/**
 * Во сколько раз ячейка атласа больше сетки шрифта: около 32 пикселей на ячейку и целое число
 * текселей на пиксель шрифта, иначе пиксели шрифта легли бы неровно.
 */
export const atlasScale = (font: DocumentFont): number =>
  Math.max(1, Math.round(32 / Math.max(font.cellWidth, font.cellHeight)));

let builtinBytes: Promise<Uint8Array> | null = null;
const faces = new Map<string, Promise<void>>();

function fontBytes(font: DocumentFont): Promise<Uint8Array> {
  if (font.data) return Promise.resolve(font.data);
  builtinBytes ??= fetch(BUILTIN_URL).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  });
  return builtinBytes;
}

/**
 * Шрифт регистрируется в документе браузера один раз на семейство. Встроенный — под своим
 * именем: им же пишут пиксельные подписи интерфейса (`--font-pixel`). Свой — под отпечатком.
 */
function registerFace(family: string, bytes: Uint8Array): Promise<void> {
  let face = faces.get(family);
  if (!face) {
    const source = new FontFace(family, bytes.slice().buffer);
    face = source.load().then((loaded) => {
      document.fonts.add(loaded);
    });
    faces.set(family, face);
    face.catch(() => faces.delete(family));
  }
  return face;
}

async function loadVector(font: DocumentFont, scale: number): Promise<LoadedFont> {
  const bytes = await fontBytes(font);
  const info = parseSfnt(bytes);
  const family = font.kind === 'builtin' ? font.name : `bytefall-${font.id}`;
  await registerFace(family, bytes);
  const layout = vectorLayout(info, font.cellHeight);
  return {
    font,
    painter: vectorPainter(family, layout, font, scale),
    groups: glyphGroups(info.codePoints),
    look: { kind: 'family', family, size: layout.size, cellHeight: font.cellHeight },
  };
}

async function decodeImage(bytes: Uint8Array): Promise<ImageData> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Лист белым по прозрачному: символ — по маске `tilesetInk`, цвет листа не важен. */
async function loadTileset(font: DocumentFont, scale: number): Promise<LoadedFont> {
  const image = await decodeImage(await fontBytes(font));
  const cell = tilesetCell(image.width, image.height);
  if (!cell || cell.cellWidth !== font.cellWidth || cell.cellHeight !== font.cellHeight) {
    throw new Error('tileset size does not match the font cell');
  }
  const mask = tilesetInk(image.data, image.width, image.height);
  mask.forEach((alpha, i) => image.data.set([255, 255, 255, alpha], i * 4));
  const sheet = document.createElement('canvas');
  sheet.width = image.width;
  sheet.height = image.height;
  sheet.getContext('2d')?.putImageData(image, 0, 0);
  return {
    font,
    painter: tilesetPainter(sheet, font, scale),
    groups: [{ title: 'CP437', chars: TILESET_CHARS.join('') }],
    look: {
      kind: 'sheet',
      url: sheet.toDataURL('image/png'),
      cellWidth: font.cellWidth,
      cellHeight: font.cellHeight,
    },
  };
}

/** Встроенный шрифт для подписей интерфейса: он нужен, какой бы шрифт ни был у документа. */
export async function loadBuiltinFace(): Promise<void> {
  await registerFace(BUILTIN_FONT.name, await fontBytes(BUILTIN_FONT));
}

/** Загружает шрифт документа: у встроенного файл берётся с сервера редактора. */
export function loadDocumentFont(font: DocumentFont): Promise<LoadedFont> {
  const scale = atlasScale(font);
  return font.kind === 'tileset' ? loadTileset(font, scale) : loadVector(font, scale);
}

/**
 * Запасной шрифт для документа, свой шрифт которого не загрузился: встроенный в ячейке
 * документа. Геометрия документа не меняется, меняется только вид символов.
 */
export const fallbackFont = (font: DocumentFont): DocumentFont => ({
  ...BUILTIN_FONT,
  cellWidth: font.cellWidth,
  cellHeight: font.cellHeight,
});

export const FONT_FILE_EXTENSIONS = ['.ttf', '.otf', '.png'] as const;

/**
 * Файл шрифта от пользователя: TTF/OTF или лист CP437 в PNG. Ячейка находится сама — у TTF из
 * контуров, у листа из размера картинки; поправить её можно в окне шрифта.
 */
export async function readFontFile(name: string, bytes: Uint8Array): Promise<DocumentFont> {
  const title = name.replace(/\.[^.]+$/, '');
  if (isSfnt(bytes)) {
    const cell = vectorCell(parseSfnt(bytes));
    return createUserFont(title, 'vector', bytes, cell.cellWidth, cell.cellHeight);
  }
  if (isPng(bytes)) {
    const image = await decodeImage(bytes);
    const cell = tilesetCell(image.width, image.height);
    if (!cell) {
      throw new Error(
        `картинка ${image.width}×${image.height} не делится на 16×16 символов от 2 до 64 пикселей`,
      );
    }
    return createUserFont(title, 'tileset', bytes, cell.cellWidth, cell.cellHeight);
  }
  throw new Error('это не TTF, не OTF и не PNG');
}
