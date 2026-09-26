/**
 * Лист спрайтов для движков: кадры в сетке и атлас JSON в формате Aseprite, который понимают
 * Unity, Godot, Phaser и большинство импортёров. Лист не шире предела текстуры: кадры, что не
 * влезли, уходят на следующий лист, у каждого листа свой атлас.
 */

/** Сторона листа, которую берут все движки и видеокарты, включая мобильные. */
export const MAX_SHEET_SIDE = 4096;

export interface SheetLayout {
  readonly columns: number;
  readonly rows: number;
  /** Номера кадров на этом листе, по порядку. */
  readonly frames: readonly number[];
}

/**
 * Раскладка кадров по листам: лист близок к квадрату и не больше `maxSide` по стороне. Кадр
 * шире предела ложится в один столбец: лист выходит шириной с сам кадр, и меньше не сделать.
 */
export function sheetLayouts(
  count: number,
  frameWidth: number,
  frameHeight: number,
  maxSide = MAX_SHEET_SIDE,
): SheetLayout[] {
  const maxColumns = Math.max(1, Math.floor(maxSide / frameWidth));
  const maxRows = Math.max(1, Math.floor(maxSide / frameHeight));
  const capacity = maxColumns * maxRows;
  const out: SheetLayout[] = [];
  for (let first = 0; first < count; first += capacity) {
    const frames = Array.from({ length: Math.min(capacity, count - first) }, (_, i) => first + i);
    const columns = Math.min(maxColumns, Math.ceil(Math.sqrt(frames.length)));
    out.push({ columns, rows: Math.ceil(frames.length / columns), frames });
  }
  return out;
}

interface Size {
  readonly w: number;
  readonly h: number;
}

/**
 * Атлас одного листа в формате JSON Aseprite («массив»): прямоугольник и длительность каждого
 * кадра. `name` — имя сцены: из него имена кадров, `image` — файл листа рядом с атласом.
 */
export function sheetAtlas(
  layout: SheetLayout,
  frame: Size,
  durations: readonly number[],
  name: string,
  image: string,
): object {
  return {
    frames: layout.frames.map((index, i) => {
      const rect = {
        x: (i % layout.columns) * frame.w,
        y: Math.floor(i / layout.columns) * frame.h,
        ...frame,
      };
      return {
        filename: `${name} ${index}`,
        frame: rect,
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, ...frame },
        sourceSize: frame,
        duration: durations[index],
      };
    }),
    meta: {
      app: 'Bytefall Editor',
      version: '1',
      image,
      format: 'RGBA8888',
      size: { w: layout.columns * frame.w, h: layout.rows * frame.h },
      scale: '1',
    },
  };
}
