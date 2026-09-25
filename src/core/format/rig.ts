import { z } from 'zod';
import { MAX_BONE_LENGTH, MAX_LIMIT, MIN_BONE_LENGTH, type Rig, normalizeLimit } from '../rig';

const angle = z.number().min(-MAX_LIMIT).max(MAX_LIMIT);

/** Кость или контроллер рига в файле (версия 9). */
export const rigSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('bone'),
    length: z.number().min(MIN_BONE_LENGTH).max(MAX_BONE_LENGTH),
    limit: z.object({ min: angle, max: angle }).optional(),
  }),
  z.object({ kind: z.literal('control') }),
]);

type RigFile = z.infer<typeof rigSchema>;

export function rigToFile(rig: Rig): RigFile {
  if (rig.kind === 'control') return { kind: 'control' };
  return { kind: 'bone', length: rig.length, ...(rig.limit ? { limit: { ...rig.limit } } : {}) };
}

/** Пределы из файла приводятся к порядку: min больше max не бывает. */
export function rigFromFile(file: RigFile | undefined): Rig | null {
  if (!file) return null;
  if (file.kind === 'control') return { kind: 'control' };
  const limit = file.limit ? normalizeLimit(file.limit) : null;
  return { kind: 'bone', length: file.length, limit };
}
