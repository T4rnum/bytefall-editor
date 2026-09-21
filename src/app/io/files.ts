import { fileOpen, fileSave } from 'browser-fs-access';
import type { Animation } from '../../core/animation';
import { safeFileName } from '../../core/filename';
import {
  DocumentFormatError,
  FILE_EXTENSION,
  deserialize,
  serialize,
} from '../../core/serialization';
import type { FileRef } from '../store/documentStore';

export interface OpenedFile {
  readonly animation: Animation;
  readonly file: FileRef;
}

/** Разбор идёт синхронно в главном потоке, поэтому файл ограничен ещё до чтения. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

/** null, если пользователь отменил диалог. */
export async function openDocumentFile(): Promise<OpenedFile | null> {
  try {
    const file = await fileOpen({
      description: 'Bytefall document',
      extensions: ['.json'],
      mimeTypes: ['application/json'],
    });
    if (file.size > MAX_FILE_BYTES) {
      const mb = Math.round(file.size / (1024 * 1024));
      throw new DocumentFormatError(`File is too large: ${mb} MB, limit is 100 MB`);
    }
    const animation = deserialize(await file.text());
    return { animation, file: { name: file.name, handle: file.handle ?? null } };
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

/** Сохраняет в существующий файл, либо через диалог. null при отмене. */
export async function saveDocumentFile(
  animation: Animation,
  current: FileRef,
  saveAs: boolean,
): Promise<FileRef | null> {
  const blob = new Blob([serialize(animation)], { type: 'application/json' });
  const fileName = current.name ?? `${safeFileName(animation.name)}${FILE_EXTENSION}`;
  try {
    const handle = await fileSave(
      blob,
      { fileName, description: 'Bytefall document', extensions: ['.json'] },
      saveAs ? null : current.handle,
      false,
    );
    return { name: handle?.name ?? fileName, handle: handle ?? null };
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

/** true, если файл сохранён; false при отмене. */
export async function saveBlobFile(
  blob: Blob,
  fileName: string,
  extension: string,
  description: string,
): Promise<boolean> {
  try {
    await fileSave(blob, { fileName, description, extensions: [extension] });
    return true;
  } catch (error) {
    if (isAbort(error)) return false;
    throw error;
  }
}
