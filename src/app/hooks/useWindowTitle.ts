import { useEffect } from 'react';
import { platform } from '../io/platform';
import { useDocumentStore } from '../store/documentStore';

/**
 * Заголовок окна — имя документа и точка, пока есть несохранённое: так видно в панели задач,
 * что открыто и что не сохранено. В настольном приложении заголовок у нативного окна свой.
 */
export function useWindowTitle(): void {
  const name = useDocumentStore((s) => s.file.name ?? s.doc.name);
  const dirty = useDocumentStore((s) => s.dirty);
  useEffect(() => {
    const title = `${dirty ? '• ' : ''}${name} — Bytefall`;
    document.title = title;
    void platform.setTitle(title);
  }, [name, dirty]);
}
