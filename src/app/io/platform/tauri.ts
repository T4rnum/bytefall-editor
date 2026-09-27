import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, stat, watch, writeFile } from '@tauri-apps/plugin-fs';
import type { FileKind, PickedFile, Platform } from './types';

/** Имя файла из пути: на Windows разделитель — обратная черта. */
export const baseName = (path: string): string => path.split(/[\\/]/).pop() || path;

const filters = (kind: FileKind) => [
  { name: kind.description, extensions: kind.extensions.map((e) => e.replace(/^\./, '')) },
];

async function readPath(path: string): Promise<PickedFile> {
  const info = await stat(path);
  return {
    name: baseName(path),
    size: info.size,
    bytes: () => readFile(path),
    target: { kind: 'path', path },
  };
}

/**
 * Настольное приложение на Tauri: нативные диалоги, файлы по пути, слежение за ними. Доступ к
 * файлу открывает диалог; плагин persisted-scope помнит его между запусками — поэтому недавние
 * файлы открываются без диалога.
 */
export const tauriPlatform: Platform = {
  desktop: true,
  async pickFile(kind) {
    const path = await open({ multiple: false, directory: false, filters: filters(kind) });
    return typeof path === 'string' ? readPath(path) : null;
  },
  async saveFile(data, kind, fileName, target) {
    const path =
      target?.kind === 'path'
        ? target.path
        : await save({ defaultPath: fileName, filters: filters(kind) });
    if (!path) return null;
    const blob = await data;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return { name: baseName(path), target: { kind: 'path', path } };
  },
  readPath,
  async stamp(target) {
    if (target.kind !== 'path') return null;
    try {
      const info = await stat(target.path);
      return { size: info.size, modified: info.mtime?.getTime() ?? 0 };
    } catch {
      return null;
    }
  },
  setTitle: (title) => getCurrentWindow().setTitle(title),
  async watch(target, onChange) {
    if (target.kind !== 'path') return () => undefined;
    return watch(target.path, () => onChange(), { delayMs: 300 });
  },
};
