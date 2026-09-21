const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_LENGTH = 64;

/** Имя файла из имени документа: только буквы, цифры, дефис и подчёркивание. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_LENGTH);
  if (!cleaned) return 'untitled';
  return RESERVED_WINDOWS_NAMES.test(cleaned) ? `_${cleaned}` : cleaned;
}
