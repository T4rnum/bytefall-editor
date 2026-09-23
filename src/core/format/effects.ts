import { z } from 'zod';
import { MAX_DIMENSION } from '../document';
import { id } from './primitives';

const periodMs = z.number().min(10).max(600000);
const unit = z.number().min(0).max(1);
const effectBase = { id, enabled: z.boolean() };
/** Эффекты слоя: вид и его параметры с пределами, файл недоверенный. */
export const effectSchema = z.discriminatedUnion('kind', [
  z.object({
    ...effectBase,
    kind: z.literal('pulse'),
    period: periodMs,
    amplitude: unit,
    spread: z.number().min(-10).max(10),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('wave'),
    period: periodMs,
    amplitude: z.number().min(0).max(64),
    wavelength: z.number().min(1).max(MAX_DIMENSION),
  }),
  z.object({ ...effectBase, kind: z.literal('flicker'), period: periodMs, density: unit }),
  z.object({
    ...effectBase,
    kind: z.literal('scroll'),
    dx: z.number().min(-1000).max(1000),
    dy: z.number().min(-1000).max(1000),
    wrap: z.boolean(),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('cycle'),
    glyphs: z.string().max(64),
    period: periodMs,
    spread: z.number().min(-10).max(10),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('fire'),
    height: z.number().int().min(1).max(64),
    period: periodMs,
    palette: z.enum(['fire', 'ice', 'toxic']),
    glyphs: z.string().min(1).max(32),
  }),
]);
