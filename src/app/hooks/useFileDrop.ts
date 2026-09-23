import { useEffect, useState } from 'react';
import { isImageFile } from '../io/image';
import { openDroppedDocumentAction } from '../store/fileActions';
import { importImageFileAction } from '../store/importActions';

/** Несёт ли перетаскивание файлы: текст и ссылки окну не нужны. */
const carriesFiles = (event: DragEvent): boolean =>
  event.dataTransfer?.types.includes('Files') ?? false;

/** Картинка уходит в диалог импорта, всё остальное открывается как документ. */
function openDropped(file: File): void {
  if (isImageFile(file)) void importImageFileAction(file);
  else void openDroppedDocumentAction(file);
}

/**
 * Файл, брошенный в любое место окна. Возвращает, тащат ли сейчас файл над окном: тогда окно
 * показывает, что его можно отпустить. Браузер по умолчанию открыл бы файл вместо редактора и
 * потерял бы несохранённую работу, поэтому перетаскивание файлов перехватывается целиком.
 */
export function useFileDrop(): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    // dragenter и dragleave приходят от каждого вложенного элемента: считаем глубину.
    let depth = 0;
    const onEnter = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) openDropped(file);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
  return dragging;
}
