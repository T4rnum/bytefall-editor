import { z } from 'zod';
import { normalizeHex } from '../color';
import {
  type GlyphMaterial,
  MAX_GLOW_RADIUS,
  MAX_GLOW_STRENGTH,
  MAX_OUTLINE_WIDTH,
  MAX_SHINE_SPEED,
} from '../material';
import { hex } from './primitives';

/** GPU-материал объекта в файле (версия 8): контур и свечение, каждое по желанию. */
export const materialSchema = z.object({
  outline: z
    .object({ color: hex, width: z.number().int().min(1).max(MAX_OUTLINE_WIDTH) })
    .optional(),
  glow: z
    .object({
      color: hex,
      radius: z.number().min(0.05).max(MAX_GLOW_RADIUS),
      strength: z.number().min(0).max(MAX_GLOW_STRENGTH),
    })
    .optional(),
  shine: z
    .object({
      color: hex,
      width: z.number().min(0.1).max(64),
      spacing: z.number().min(0.5).max(256),
      speed: z.number().min(-MAX_SHINE_SPEED).max(MAX_SHINE_SPEED),
      angle: z.number().min(-360).max(360),
    })
    .optional(),
  dither: z.object({ amount: z.number().min(0).max(1) }).optional(),
});

type MaterialFile = z.infer<typeof materialSchema>;

/** Материал из файла; без обеих частей — null, как у объекта без материала. */
export function materialFromFile(file: MaterialFile | undefined): GlyphMaterial | null {
  if (!file || (!file.outline && !file.glow && !file.shine && !file.dither)) return null;
  return {
    outline: file.outline ? { ...file.outline, color: normalizeHex(file.outline.color) } : null,
    glow: file.glow ? { ...file.glow, color: normalizeHex(file.glow.color) } : null,
    shine: file.shine ? { ...file.shine, color: normalizeHex(file.shine.color) } : null,
    dither: file.dither ?? null,
  };
}

/** Материал в файл: пустые части не пишутся. */
export function materialToFile(material: GlyphMaterial): MaterialFile {
  return {
    ...(material.outline ? { outline: material.outline } : {}),
    ...(material.glow ? { glow: material.glow } : {}),
    ...(material.shine ? { shine: material.shine } : {}),
    ...(material.dither ? { dither: material.dither } : {}),
  };
}
