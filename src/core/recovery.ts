import { z } from 'zod';
import type { Animation } from './animation';
import { serialize } from './serialization';

/**
 * Запись автосохранения: документ целиком плюс то, что показывается до его разбора.
 *
 * Документ хранится в формате файла, а не объектами из памяти. Формат версионирован и умеет
 * мигрировать, поэтому запись, оставленная прошлой версией редактора, откроется и в новой.
 * Объекты в памяти меняют форму без всяких миграций, и такая запись однажды молча сломалась бы.
 */
export interface RecoverySlot {
  /** Сессия вкладки, которая вела запись. У каждой вкладки своя, иначе они затирали бы друг друга. */
  readonly session: string;
  /** Время записи в миллисекундах с эпохи. */
  readonly savedAt: number;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly data: string;
}

export function makeRecoverySlot(session: string, anim: Animation, savedAt: number): RecoverySlot {
  return {
    session,
    savedAt,
    name: anim.name,
    width: anim.width,
    height: anim.height,
    frames: anim.frames.length,
    data: serialize(anim),
  };
}

/** Хранилище браузера так же недоверенное, как файл: туда могла писать другая версия редактора. */
const slotSchema = z.object({
  session: z.string().min(1).max(200),
  savedAt: z.number().finite().nonnegative(),
  name: z.string().max(500),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frames: z.number().int().positive(),
  data: z.string(),
});

export function isRecoverySlot(value: unknown): value is RecoverySlot {
  return slotSchema.safeParse(value).success;
}

/**
 * Записи из нескольких хранилищ: у каждой сессии остаётся самая свежая. Копия, сделанная на
 * уходе со страницы, бывает новее основной записи — та не успела дописаться до выгрузки.
 */
export function mergeRecoverySlots(...lists: readonly (readonly unknown[])[]): RecoverySlot[] {
  const newest = new Map<string, RecoverySlot>();
  for (const list of lists) {
    for (const raw of list) {
      if (!isRecoverySlot(raw)) continue;
      const known = newest.get(raw.session);
      if (!known || raw.savedAt > known.savedAt) newest.set(raw.session, raw);
    }
  }
  return [...newest.values()];
}

/**
 * Записи, которые стоит предложить восстановить: не принадлежащие живым вкладкам и новые первыми.
 * Запись живой вкладки не авария, а работа, которая идёт прямо сейчас в соседнем окне.
 */
export function recoverableSlots(
  slots: readonly unknown[],
  live: ReadonlySet<string>,
): RecoverySlot[] {
  return slots
    .filter(isRecoverySlot)
    .filter((slot) => !live.has(slot.session))
    .sort((a, b) => b.savedAt - a.savedAt);
}
