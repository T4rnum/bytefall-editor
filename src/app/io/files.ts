import { fileOpen, fileSave } from 'browser-fs-access';
import type { Animation } from '../../core/animation';
import { safeFileName } from '../../core/filename';
import { DocumentFormatError, FILE_EXTENSION, serialize } from '../../core/serialization';
import type { FileRef } from '../store/documentStore';
import { type SourceKind, readDocument } from './readDocument';

export interface OpenedFile {
  readonly animation: Animation;
  readonly file: FileRef;
  /** Откуда документ: импорт из чужого формата к исходному файлу не привязывается. */
  readonly kind: SourceKind;
  /** Имя открытого файла, в том числе импортированного. */
  readonly sourceName: string;
}

/** Разбор идёт синхронно в главном потоке, поэтому файл ограничен ещё до чтения. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

/**
 * Читает файл документа: выбранный в диалоге или перетащенный в окно. У перетащенного файла нет
 * дескриптора, поэтому «Сохранить» спросит, куда писать.
 */
export async function readDocumentFile(
  file: File,
  handle: FileSystemFileHandle | null = null,
): Promise<OpenedFile> {
  if (file.size > MAX_FILE_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new DocumentFormatError(`Файл слишком большой: ${mb} МБ, предел — 100 МБ`);
  }
  const read = await readDocument(new Uint8Array(await file.arrayBuffer()), file.name);
  // Импорт не привязывается к исходному файлу: иначе «Сохранить» перезаписало бы .xp или
  // файл прототипа нашим форматом, и открыть их прежней программой стало бы нельзя.
  const ref: FileRef =
    read.kind === 'bytefall' ? { name: file.name, handle } : { name: null, handle: null };
  return { animation: read.animation, file: ref, kind: read.kind, sourceName: file.name };
}

/** null, если пользователь отменил диалог. */
export async function openDocumentFile(): Promise<OpenedFile | null> {
  try {
    const file = await fileOpen({
      description: 'Документ Bytefall, изображение REXPaint или файл первого прототипа',
      extensions: ['.json', '.xp'],
      mimeTypes: ['application/json', 'application/octet-stream'],
    });
    return await readDocumentFile(file, file.handle ?? null);
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

/** Файл картинки для импорта. null, если пользователь отменил диалог. */
export async function openImageFile(): Promise<File | null> {
  try {
    return await fileOpen({
      description: 'Изображение',
      extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif'],
      mimeTypes: ['image/*'],
    });
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
      { fileName, description: 'Документ Bytefall', extensions: ['.json'] },
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
