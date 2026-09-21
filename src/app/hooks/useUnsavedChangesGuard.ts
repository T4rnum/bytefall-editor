import { useEffect } from 'react';
import { useDocumentStore } from '../store/documentStore';

/** Браузер спросит подтверждение при закрытии вкладки с несохранёнными изменениями. */
export function useUnsavedChangesGuard(): void {
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!useDocumentStore.getState().dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
