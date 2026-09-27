import type { Animation } from '../../core/animation';
import { safeFileName } from '../../core/filename';
import { DocumentFormatError, FILE_EXTENSION, serialize } from '../../core/serialization';
import type { FileRef } from '../store/documentStore';
import { type FileKind, type PickedFile, platform } from './platform';
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

export const DOCUMENT_FILES: FileKind = {
  description: 'Документ Bytefall, изображение REXPaint или файл первого прототипа',
  extensions: ['.json', '.xp'],
  mimeTypes: ['application/json', 'application/octet-stream'],
};

const SAVED_DOCUMENT: FileKind = {
  description: 'Документ Bytefall',
  extensions: ['.json'],
  mimeTypes: ['application/json'],
};

const IMAGE_FILES: FileKind = {
  description: 'Изображение',
  extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif'],
  mimeTypes: ['image/*'],
};

const MODEL_EXTENSIONS = ['.glb', '.gltf'];

const MODEL_FILES: FileKind = {
  description: '3D-модель glTF',
  extensions: MODEL_EXTENSIONS,
  mimeTypes: ['model/gltf-binary', 'model/gltf+json'],
};

const PALETTE_FILES: FileKind = {
  description: 'Палитра',
  extensions: ['.hex', '.gpl', '.pal', '.txt', '.ase'],
  mimeTypes: ['text/plain', 'application/octet-stream'],
};

/** Перетащенный в окно файл: читается как выбранный, но писать в него обратно нельзя. */
export const droppedFile = (file: File): PickedFile => ({
  name: file.name,
  size: file.size,
  bytes: async () => new Uint8Array(await file.arrayBuffer()),
  target: null,
});

/** Выбранный файл как `File`: картинку декодирует браузер, модели и палитре нужны байты. */
async function asFile(picked: PickedFile): Promise<File> {
  const bytes = await picked.bytes();
  return new File([bytes.slice()], picked.name);
}

/**
 * Читает файл документа: выбранный в диалоге, перетащенный в окно или недавний. У
 * перетащенного нет места на диске, поэтому «Сохранить» спросит, куда писать.
 */
export async function readDocumentFile(file: PickedFile): Promise<OpenedFile> {
  if (file.size > MAX_FILE_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024));
    throw new DocumentFormatError(`Файл слишком большой: ${mb} МБ, предел — 100 МБ`);
  }
  const read = await readDocument(await file.bytes(), file.name);
  // Импорт не привязывается к исходному файлу: иначе «Сохранить» перезаписало бы .xp или
  // файл прототипа нашим форматом, и открыть их прежней программой стало бы нельзя.
  const ref: FileRef =
    read.kind === 'bytefall'
      ? { name: file.name, target: file.target }
      : { name: null, target: null };
  return { animation: read.animation, file: ref, kind: read.kind, sourceName: file.name };
}

/** null, если пользователь отменил диалог. */
export async function openDocumentFile(): Promise<OpenedFile | null> {
  const file = await platform.pickFile(DOCUMENT_FILES);
  return file ? readDocumentFile(file) : null;
}

/** Файл картинки для импорта. null, если пользователь отменил диалог. */
export async function openImageFile(): Promise<File | null> {
  const picked = await platform.pickFile(IMAGE_FILES);
  return picked ? asFile(picked) : null;
}

/** Модель glTF: двоичная .glb или .gltf, у которой данные встроены в сам файл. */
export const isModelFile = (file: { readonly name: string }): boolean =>
  MODEL_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

/** Файл 3D-модели. null, если пользователь отменил диалог. */
export async function openModelFile(): Promise<File | null> {
  const picked = await platform.pickFile(MODEL_FILES);
  return picked ? asFile(picked) : null;
}

/** Палитры меньше мегабайта: больше — это не палитра, и читать её целиком незачем. */
export const MAX_PALETTE_FILE_BYTES = 1024 * 1024;

/** Файл палитры: Lospec, GIMP, JASC, Paint.NET, Adobe. null, если пользователь отменил диалог. */
export async function openPaletteFile(): Promise<File | null> {
  const picked = await platform.pickFile(PALETTE_FILES);
  if (!picked) return null;
  if (picked.size > MAX_PALETTE_FILE_BYTES) throw new Error('файл больше мегабайта');
  return asFile(picked);
}

/** Сохраняет в тот же файл, либо через диалог. null при отмене. */
export async function saveDocumentFile(
  animation: Animation,
  current: FileRef,
  saveAs: boolean,
): Promise<FileRef | null> {
  const blob = new Blob([serialize(animation)], { type: 'application/json' });
  const fileName = current.name ?? `${safeFileName(animation.name)}${FILE_EXTENSION}`;
  const saved = await platform.saveFile(
    blob,
    SAVED_DOCUMENT,
    fileName,
    saveAs ? null : current.target,
  );
  return saved && { name: saved.name, target: saved.target };
}

/**
 * true, если файл сохранён; false при отмене. Содержимое может ещё считаться: диалог
 * открывается сразу — браузер пускает его только по свежему щелчку, — а файл пишется, когда
 * обещание выполнится.
 */
export async function saveBlobFile(
  blob: Blob | Promise<Blob>,
  fileName: string,
  extension: string,
  description: string,
): Promise<boolean> {
  const kind: FileKind = { description, extensions: [extension], mimeTypes: [] };
  return (await platform.saveFile(blob, kind, fileName, null)) !== null;
}
