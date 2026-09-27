/**
 * Недавние файлы настольного приложения: путь, имя и когда открывали. В браузере путей нет —
 * там список пуст. Хранится в настройках вида, не в документе.
 */
export interface RecentFile {
  readonly path: string;
  readonly name: string;
  readonly openedAt: number;
}

export const MAX_RECENT = 10;

/** Один файл под разными написаниями пути: регистр и разделители Windows не различаются. */
const samePath = (a: string, b: string): boolean =>
  a.replaceAll('\\', '/').toLowerCase() === b.replaceAll('\\', '/').toLowerCase();

/** Список с файлом в начале: повтор уходит, лишние с конца отпадают. */
export function withRecent(list: readonly RecentFile[], file: RecentFile): RecentFile[] {
  return [file, ...list.filter((f) => !samePath(f.path, file.path))].slice(0, MAX_RECENT);
}

export const withoutRecent = (list: readonly RecentFile[], path: string): RecentFile[] =>
  list.filter((f) => !samePath(f.path, path));

/** Список из хранилища: чужие записи отбрасываются, порядок и предел — как у свежего. */
export function restoreRecent(raw: unknown): RecentFile[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentFile[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { path, name, openedAt } = item as Partial<RecentFile>;
    if (typeof path !== 'string' || typeof name !== 'string' || typeof openedAt !== 'number') {
      continue;
    }
    if (!out.some((f) => samePath(f.path, path))) out.push({ path, name, openedAt });
  }
  return out.slice(0, MAX_RECENT);
}
