import { useEffect } from 'react';
import { autosaveService } from '../autosave/service';

/**
 * Запускает автосохранение и дописывает его, когда вкладку прячут. Скрытую вкладку браузер может
 * выгрузить без всякого `beforeunload`, особенно на телефоне, поэтому последний шанс — здесь.
 * Обычная запись асинхронна и при закрытии часто не успевает, поэтому сначала ложится
 * синхронная копия.
 */
export function useAutosave(): void {
  useEffect(() => {
    const { autosave } = autosaveService();
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') autosave.flushOnExit();
    };
    const onPageHide = (): void => autosave.flushOnExit();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);
}
