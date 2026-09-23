import { z } from 'zod';
import {
  type Animation,
  DEFAULT_FRAME_DURATION,
  MAX_FRAMES,
  createAnimation,
  createFrame,
} from '../animation';
import { type Cell, makeCell } from '../cell';
import { isHexColor } from '../color';
import {
  type Layer,
  MAX_DIMENSION,
  MAX_LAYERS,
  createDocument,
  createLayer,
  newId,
} from '../document';
import { type CellKey, keyOf } from '../grid';
import { DocumentFormatError, MAX_GLYPH_LENGTH, MAX_ID_LENGTH } from '../serialization';

/** Холст прототипа по умолчанию: свой размер прототип в файл не писал. */
export const PROTOTYPE_DEFAULT_SIZE = 51;

/** Файл недоверенный, как и наш: у каждого массива предел. */
const cellSchema = z.object({
  char: z.string().max(MAX_GLYPH_LENGTH).optional(),
  color: z.string().max(64).optional(),
  bgColor: z.string().max(64).optional(),
});
const layerSchema = z.object({
  id: z.string().max(MAX_ID_LENGTH).optional(),
  name: z.string().max(200).optional(),
  visible: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  data: z.array(z.tuple([z.string().max(32), cellSchema])).max(MAX_DIMENSION * MAX_DIMENSION),
});
const fileSchema = z
  .array(z.object({ layers: z.array(layerSchema).max(MAX_LAYERS) }))
  .min(1)
  .max(MAX_FRAMES);

type PrototypeLayer = z.infer<typeof layerSchema>;

/** Файл прототипа — массив кадров; наш формат — объект с версией. Так они и различаются. */
export const isPrototypeFile = (raw: unknown): boolean => Array.isArray(raw);

/** Ключ прототипа «x,y» в координаты. Мусорный ключ — не ячейка, а не повод падать. */
function parseKey(key: string): { x: number; y: number } | null {
  const [x, y] = key.split(',').map(Number);
  const valid = (v: number | undefined): v is number =>
    Number.isInteger(v) && v !== undefined && v >= 0 && v < MAX_DIMENSION;
  return valid(x) && valid(y) ? { x, y } : null;
}

/**
 * Ячейка прототипа. Стёртые ячейки прототип иногда хранил пустыми строками вместо удаления —
 * они пропускаются. Негодный цвет символа становится белым, фона — отсутствием фона.
 */
function toCell(raw: z.infer<typeof cellSchema>): Cell | null {
  const glyph = [...(raw.char ?? '')][0] ?? '';
  const bg = raw.bgColor && isHexColor(raw.bgColor) ? raw.bgColor : null;
  if ((glyph === '' || glyph === ' ') && bg === null) return null;
  const fg = raw.color && isHexColor(raw.color) ? raw.color : '#ffffff';
  return makeCell(glyph === ' ' ? '' : glyph, fg, bg);
}

function cellsOf(layer: PrototypeLayer, extent: { w: number; h: number }): Map<CellKey, Cell> {
  const cells = new Map<CellKey, Cell>();
  for (const [key, raw] of layer.data) {
    const point = parseKey(key);
    const cell = point && toCell(raw);
    if (!point || !cell) continue;
    extent.w = Math.max(extent.w, point.x + 1);
    extent.h = Math.max(extent.h, point.y + 1);
    cells.set(keyOf(point.x, point.y), cell);
  }
  return cells;
}

/**
 * JSON первого прототипа Bytefall. Там у каждого кадра свои слои, а у нас слои общие: они
 * сводятся в один список по id в порядке первого появления, и в кадре без какого-то слоя этот
 * слой просто пуст. Длительность кадров прототип не хранил — ставится обычная. Размер холста —
 * не меньше прежнего по умолчанию и не меньше, чем нужно рисунку.
 */
export function parsePrototype(raw: unknown, name: string): Animation {
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    throw new DocumentFormatError(`Файл прототипа повреждён${path}: ${issue?.message ?? ''}`);
  }
  const extent = { w: PROTOTYPE_DEFAULT_SIZE, h: PROTOTYPE_DEFAULT_SIZE };
  const order: { key: string; layer: Layer }[] = [];
  const perFrame = parsed.data.map((frame) =>
    frame.layers.map((layer, index) => {
      const key = layer.id ?? `#${index}`;
      if (!order.some((o) => o.key === key)) {
        if (order.length >= MAX_LAYERS) throw new DocumentFormatError('Слишком много слоёв');
        const base = createLayer(layer.name ?? `Слой ${order.length + 1}`, newId('layer'));
        const props = { visible: layer.visible ?? true, opacity: layer.opacity ?? 1 };
        order.push({ key, layer: { ...base, ...props } });
      }
      return { key, cells: cellsOf(layer, extent) };
    }),
  );

  const frames = perFrame.map((layers) =>
    createFrame(
      order.map(({ key, layer }) => ({
        ...layer,
        cells: layers.find((l) => l.key === key)?.cells ?? new Map<CellKey, Cell>(),
      })),
      [],
      DEFAULT_FRAME_DURATION,
    ),
  );
  // Шрифт, палитра и тёмный холст — как у нового документа: прототип рисовал на тёмном.
  const base = createDocument({
    name,
    width: Math.min(MAX_DIMENSION, extent.w),
    height: Math.min(MAX_DIMENSION, extent.h),
  });
  return { ...createAnimation(base), frames };
}
