import { z } from 'zod';
import { MAX_DEFORMERS_PER_OBJECT } from '../graph/legacy';
import { MAX_BONE_LENGTH, MIN_BONE_LENGTH } from '../rig';
import { MAX_FALLOFF, MAX_SKIN_BONES, MIN_FALLOFF } from '../skin';
import { MAX_SCALE, MIN_SCALE } from '../transform';
import { hex, id } from './primitives';

const period = z.number().min(10).max(600000);
const length = z.number().min(0.5).max(2048);
const scale = z.number().min(MIN_SCALE).max(MAX_SCALE);
const base = { id, enabled: z.boolean() };
/** Число матрицы привязки: с запасом на холст, поворот и масштаб, но не бесконечность. */
const entry = z.number().min(-1e6).max(1e6);
const matrix = z.object({ a: entry, b: entry, c: entry, d: entry, e: entry, f: entry });
/** Кость скиннинга: поза покоя относительно объекта. Её же хранит узел «Кости» графа. */
export const boneSchema = z.object({
  id,
  bind: matrix,
  length: z.number().min(MIN_BONE_LENGTH).max(MAX_BONE_LENGTH),
});

/** Скиннинг (версия 9): кости с позой покоя относительно объекта. */
const skinSchema = z.object({
  ...base,
  kind: z.literal('skin'),
  falloff: z.number().min(MIN_FALLOFF).max(MAX_FALLOFF),
  bones: z.array(boneSchema).max(MAX_SKIN_BONES),
});

/**
 * Деформеры объекта в файле (версии 7–9): вид и параметры с пределами, файл недоверенный. С
 * версии 10 их нет: стек мигрирует в граф узлов.
 */
const deformerSchema = z.discriminatedUnion('kind', [
  skinSchema,
  z.object({
    ...base,
    kind: z.literal('wave'),
    axis: z.enum(['x', 'y']),
    amplitude: z.number().min(0).max(64),
    wavelength: length,
    period,
  }),
  z.object({
    ...base,
    kind: z.literal('jitter'),
    amplitude: z.number().min(0).max(8),
    angle: z.number().min(0).max(360),
    period,
    seed: z.number().int().min(0).max(2147483647),
  }),
  z.object({ ...base, kind: z.literal('twist'), strength: z.number().min(-360).max(360) }),
  z.object({
    ...base,
    kind: z.literal('scaleFalloff'),
    radius: length,
    inner: scale,
    outer: scale,
  }),
  z.object({ ...base, kind: z.literal('bend'), strength: z.number().min(-90).max(90) }),
  z.object({
    ...base,
    kind: z.literal('explode'),
    amount: z.number().min(0).max(16),
    angle: z.number().min(0).max(720),
    seed: z.number().int().min(0).max(2147483647),
  }),
  z.object({ ...base, kind: z.literal('glyphRamp'), glyphs: z.string().min(1).max(64) }),
  z.object({
    ...base,
    kind: z.literal('particles'),
    glyphs: z.string().min(1).max(64),
    from: hex,
    to: hex,
    rate: z.number().min(0).max(200),
    life: z.number().min(20).max(10000),
    speed: z.number().min(0).max(128),
    angle: z.number().min(-360).max(360),
    spread: z.number().min(0).max(360),
    gravity: z.number().min(-128).max(128),
    seed: z.number().int().min(0).max(2147483647),
  }),
  z.object({
    ...base,
    kind: z.literal('colorRamp'),
    from: hex,
    to: hex,
    axis: z.enum(['x', 'y', 'radial']),
    length,
    period: z.number().min(0).max(600000),
    amount: z.number().min(0).max(1),
  }),
]);

export const deformersSchema = z.array(deformerSchema).max(MAX_DEFORMERS_PER_OBJECT);
