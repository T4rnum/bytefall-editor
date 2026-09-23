import { z } from 'zod';
import { EFFECT_PARAM_SPECS, type EffectKind } from '../effects';
import type { EffectParam } from '../tracks';
import { id } from './primitives';

/** Числовой параметр эффекта с пределами из ядра: панель, ключи и файл сходятся в одном месте. */
function param(kind: EffectKind, key: EffectParam) {
  const spec = EFFECT_PARAM_SPECS[kind][key];
  if (!spec) throw new Error(`Effect ${kind} has no parameter ${key}`);
  const n = z.number().min(spec.min).max(spec.max);
  return spec.integer ? n.int() : n;
}

const effectBase = { id, enabled: z.boolean() };
/** Эффекты слоя: вид и его параметры с пределами, файл недоверенный. */
export const effectSchema = z.discriminatedUnion('kind', [
  z.object({
    ...effectBase,
    kind: z.literal('pulse'),
    period: param('pulse', 'period'),
    amplitude: param('pulse', 'amplitude'),
    spread: param('pulse', 'spread'),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('wave'),
    period: param('wave', 'period'),
    amplitude: param('wave', 'amplitude'),
    wavelength: param('wave', 'wavelength'),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('flicker'),
    period: param('flicker', 'period'),
    density: param('flicker', 'density'),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('scroll'),
    dx: param('scroll', 'dx'),
    dy: param('scroll', 'dy'),
    wrap: z.boolean(),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('cycle'),
    glyphs: z.string().max(64),
    period: param('cycle', 'period'),
    spread: param('cycle', 'spread'),
  }),
  z.object({
    ...effectBase,
    kind: z.literal('fire'),
    height: param('fire', 'height'),
    period: param('fire', 'period'),
    palette: z.enum(['fire', 'ice', 'toxic']),
    glyphs: z.string().min(1).max(32),
  }),
]);
