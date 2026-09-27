import { create } from 'zustand';
import { readDocumentFile } from '../io/files';
import { type FileStamp, type FileTarget, platform } from '../io/platform';
import { type RecentFile, restoreRecent, withRecent, withoutRecent } from '../io/recent';
import { readSetting, writeSetting } from '../ui/persist';
import { type FileRef, useDocumentStore } from './documentStore';
import { errorMessage, notify } from './notifyStore';

/**
 * Настольное приложение: недавние файлы и слежение за открытым. Оба держатся на пути к файлу,
 * поэтому в браузере их нет: там список пуст, а слежение не запускается.
 */
interface RecentState {
  readonly files: readonly RecentFile[];
  set: (files: readonly RecentFile[]) => void;
}

export const useRecentStore = create<RecentState>((set) => ({
  files: platform.desktop ? restoreRecent(readSetting<unknown>('recent.files', [])) : [],
  set: (files) => {
    writeSetting('recent.files', files);
    set({ files });
  },
}));

const pathOf = (target: FileTarget | null): string | null =>
  target?.kind === 'path' ? target.path : null;

function remember(file: FileRef): void {
  const path = pathOf(file.target);
  if (!path || !file.name) return;
  const recent = useRecentStore.getState();
  recent.set(withRecent(recent.files, { path, name: file.name, openedAt: Date.now() }));
}

/** Есть ли несохранённое, которое откроет другой файл: тогда спрашиваем. */
function confirmDiscard(): boolean {
  if (!useDocumentStore.getState().dirty) return true;
  return window.confirm('Есть несохранённые изменения. Продолжить без сохранения?');
}

/** Открывает недавний файл. Пропал с диска — уходит из списка. */
export async function openRecentAction(path: string): Promise<void> {
  if (!confirmDiscard()) return;
  try {
    const opened = await readDocumentFile(await platform.readPath(path));
    useDocumentStore.getState().replaceAnimation(opened.animation, opened.file);
    notify(`Открыт ${opened.sourceName}`);
  } catch (error) {
    const recent = useRecentStore.getState();
    recent.set(withoutRecent(recent.files, path));
    notify(`Не удалось открыть ${path}: ${errorMessage(error)}`, 'error');
  }
}

/** Ctrl+Shift+O: последний открытый файл. */
export function openLastAction(): void {
  const last = useRecentStore.getState().files[0];
  if (last) void openRecentAction(last.path);
  else if (platform.desktop) notify('Недавних файлов пока нет');
  else notify('Недавние файлы — в настольном приложении: в браузере у файлов нет пути');
}

export function clearRecentAction(): void {
  useRecentStore.getState().set([]);
}

const sameStamp = (a: FileStamp | null, b: FileStamp | null): boolean =>
  a !== null && b !== null && a.size === b.size && a.modified === b.modified;

/**
 * Файл открытого документа изменился на диске. Своя запись отличается от чужой по отпечатку:
 * после сохранения он запомнен. Без несохранённого документ перечитывается сам, иначе —
 * по согласию; отказ запоминает новый отпечаток, чтобы не спрашивать снова.
 */
async function onChanged(target: FileTarget, name: string, known: { stamp: FileStamp | null }) {
  const now = await platform.stamp(target);
  if (!now || sameStamp(now, known.stamp)) return;
  known.stamp = now;
  const { dirty } = useDocumentStore.getState();
  if (dirty && !window.confirm(`«${name}» изменён снаружи. Перечитать и потерять несохранённое?`)) {
    return;
  }
  try {
    const opened = await readDocumentFile(await platform.readPath(pathOf(target) ?? ''));
    useDocumentStore.getState().replaceAnimation(opened.animation, opened.file);
    notify(`«${name}» изменён снаружи — перечитан`);
  } catch (error) {
    notify(`«${name}» изменён снаружи и не читается: ${errorMessage(error)}`, 'error');
  }
}

/**
 * Следит за файлом открытого документа, пока документ связан с ним. Каждое открытие и
 * сохранение — новая ссылка на файл: после своей записи запоминается отпечаток, и слежение
 * перезапускается, только если сменился путь. Возвращает отписку.
 */
export function startFileWatch(): () => void {
  if (!platform.desktop) return () => undefined;
  let watched: string | null = null;
  let stop: (() => void) | null = null;
  const known: { stamp: FileStamp | null } = { stamp: null };

  const follow = async (file: FileRef): Promise<void> => {
    const path = pathOf(file.target);
    remember(file);
    if (file.target) known.stamp = await platform.stamp(file.target);
    if (path === watched) return;
    stop?.();
    stop = null;
    watched = path;
    if (!path || !file.target) return;
    const target = file.target;
    const name = file.name ?? path;
    stop = await platform.watch(target, () => void onChanged(target, name, known));
  };

  void follow(useDocumentStore.getState().file);
  const unsubscribe = useDocumentStore.subscribe((state, prev) => {
    if (state.file !== prev.file) void follow(state.file);
  });
  return () => {
    unsubscribe();
    stop?.();
  };
}
