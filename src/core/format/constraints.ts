import { z } from 'zod';
import { MAX_CHAIN, MAX_CONSTRAINTS_PER_OBJECT, MAX_DELAY } from '../constraints';
import { id } from './primitives';

const base = { id, enabled: z.boolean() };
const delay = z.number().min(0).max(MAX_DELAY);

/** Связи объекта в файле (версия 9): задержка, слежение и IK. Без цели связь молчит. */
export const constraintSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('follow'), delay }),
  z.object({ ...base, kind: z.literal('aim'), target: id.nullable(), lag: delay }),
  z.object({
    ...base,
    kind: z.literal('ik'),
    target: id.nullable(),
    chain: z.number().int().min(1).max(MAX_CHAIN),
  }),
]);

export const constraintsSchema = z.array(constraintSchema).max(MAX_CONSTRAINTS_PER_OBJECT);
