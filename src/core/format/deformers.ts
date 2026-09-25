import { z } from 'zod';
import { MAX_DEFORMERS_PER_OBJECT } from '../deformers';
import { MAX_SCALE, MIN_SCALE } from '../transform';
import { hex, id } from './primitives';

const period = z.number().min(10).max(600000);
const length = z.number().min(0.5).max(2048);
const scale = z.number().min(MIN_SCALE).max(MAX_SCALE);
const base = { id, enabled: z.boolean() };

/** Деформеры объекта в файле (версия 7): вид и параметры с пределами, файл недоверенный. */
export const deformerSchema = z.discriminatedUnion('kind', [
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
