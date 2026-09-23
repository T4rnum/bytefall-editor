import type { Animation } from '../../core/animation';
import { isPrototypeFile, parsePrototype } from '../../core/import/prototype';
import { parseXp } from '../../core/import/xp';
import { DocumentFormatError, deserializeObject } from '../../core/serialization';

/** Откуда документ: наш файл можно сохранить обратно, импорт — только в новый файл. */
export type SourceKind = 'bytefall' | 'rexpaint' | 'prototype';

export interface ReadDocument {
  readonly animation: Animation;
  readonly kind: SourceKind;
}

/**
 * Предел распакованного .xp. Сжатый файл ограничен при открытии, но gzip из маленького файла
 * умеет развернуть гигабайты. REXPaint держит до девяти слоёв, и шести слоёв 1024×1024 хватит.
 */
export const MAX_XP_BYTES = 64 * 1024 * 1024;

/** Распаковка gzip встроенным в браузер потоком: зависимость ради неё не нужна. */
export async function gunzip(bytes: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new DocumentFormatError('Распакованный .xp слишком большой');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Имя документа — имя файла без расширения. */
export function baseName(fileName: string): string {
  const name = fileName.replace(/\.(bp\.json|json|xp)$/i, '');
  return name.length > 0 ? name : 'Без названия';
}

/**
 * Документ из байтов файла. Формат узнаётся по содержимому, а не по расширению: gzip — это .xp
 * REXPaint, JSON-массив — файл первого прототипа, JSON-объект — наш формат. Расширению верить
 * нельзя: файлы прототипа тоже назывались .json.
 */
export async function readDocument(bytes: Uint8Array, fileName: string): Promise<ReadDocument> {
  const name = baseName(fileName);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return { animation: parseXp(await gunzip(bytes, MAX_XP_BYTES), name), kind: 'rexpaint' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new DocumentFormatError('Это не документ Bytefall, не .xp и не файл прототипа');
  }
  if (isPrototypeFile(raw)) return { animation: parsePrototype(raw, name), kind: 'prototype' };
  return { animation: deserializeObject(raw), kind: 'bytefall' };
}
