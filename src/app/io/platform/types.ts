/**
 * Файлы на двух платформах: в браузере — диалоги File System Access и скачивание, в настольном
 * приложении — нативные диалоги Tauri и пути на диске. Редактор работает с этим интерфейсом и не
 * знает, где запущен.
 */

/** Файл на диске, куда можно писать снова без диалога. */
export type FileTarget =
  | { readonly kind: 'handle'; readonly handle: FileSystemFileHandle }
  | { readonly kind: 'path'; readonly path: string };

/** Какие файлы показывает диалог. Расширения с точкой. */
export interface FileKind {
  readonly description: string;
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
}

export interface PickedFile {
  readonly name: string;
  readonly size: number;
  bytes(): Promise<Uint8Array>;
  /** Куда сохранять этот же файл; null — только через «Сохранить как». */
  readonly target: FileTarget | null;
}

export interface SavedFile {
  readonly name: string;
  readonly target: FileTarget | null;
}

/** Отпечаток файла на диске: по нему своя запись отличается от чужой правки. */
export interface FileStamp {
  readonly size: number;
  readonly modified: number;
}

export interface Platform {
  /** Настольное приложение: пути на диске, недавние файлы, слежение за изменениями. */
  readonly desktop: boolean;
  /** Диалог открытия; null — отменили. */
  pickFile(kind: FileKind): Promise<PickedFile | null>;
  /**
   * Пишет в `target` без диалога, а без него — через диалог сохранения. Содержимое может ещё
   * считаться: диалог открывается сразу, пока свежо действие пользователя. null — отменили.
   */
  saveFile(
    data: Blob | Promise<Blob>,
    kind: FileKind,
    fileName: string,
    target: FileTarget | null,
  ): Promise<SavedFile | null>;
  /** Файл по пути: недавний проект. Только в настольном приложении. */
  readPath(path: string): Promise<PickedFile>;
  /** Отпечаток файла; null — такого нет или на этой платформе не узнать. */
  stamp(target: FileTarget): Promise<FileStamp | null>;
  /** Следит за файлом: `onChange` на каждое изменение. Возвращает отписку. */
  watch(target: FileTarget, onChange: () => void): Promise<() => void>;
  /** Заголовок окна приложения; в браузере заголовок вкладки ставит сам документ. */
  setTitle(title: string): Promise<void>;
}
