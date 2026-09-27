import { fileOpen, fileSave } from 'browser-fs-access';
import type { Platform } from './types';

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

/**
 * Браузер: диалоги File System Access в Chromium, в остальных — выбор файла и скачивание.
 * Путей нет, поэтому нет ни недавних файлов, ни слежения.
 */
export const browserPlatform: Platform = {
  desktop: false,
  async pickFile(kind) {
    try {
      const file = await fileOpen({
        description: kind.description,
        extensions: [...kind.extensions],
        mimeTypes: [...kind.mimeTypes],
      });
      return {
        name: file.name,
        size: file.size,
        bytes: async () => new Uint8Array(await file.arrayBuffer()),
        target: file.handle ? { kind: 'handle', handle: file.handle } : null,
      };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  },
  async saveFile(data, kind, fileName, target) {
    try {
      const handle = await fileSave(
        data,
        { fileName, description: kind.description, extensions: [...kind.extensions] },
        target?.kind === 'handle' ? target.handle : null,
        false,
      );
      return {
        name: handle?.name ?? fileName,
        target: handle ? { kind: 'handle', handle } : null,
      };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  },
  readPath() {
    return Promise.reject(new Error('открыть файл по пути можно только в настольном приложении'));
  },
  stamp: () => Promise.resolve(null),
  watch: () => Promise.resolve(() => undefined),
  setTitle: () => Promise.resolve(),
};
