import { create } from 'zustand';
import {
  type ErrorEntry,
  type ErrorSource,
  entryOf,
  formatReport,
  restoreLog,
  withError,
} from '../diagnostics/errorLog';
import { platform } from '../io/platform';
import { readSetting, writeSetting } from '../ui/persist';

interface ErrorState {
  readonly log: readonly ErrorEntry[];
  record: (thrown: unknown, source: ErrorSource) => void;
  clear: () => void;
}

/** Журнал ошибок: переживает перезагрузку, в документ не попадает. */
export const useErrorStore = create<ErrorState>((set, get) => ({
  log: restoreLog(readSetting<unknown>('errors', [])),
  record: (thrown, source) => {
    const log = withError(get().log, entryOf(thrown, source, Date.now()));
    writeSetting('errors', log);
    set({ log });
  },
  clear: () => {
    writeSetting('errors', []);
    set({ log: [] });
  },
}));

/** Отчёт для копирования: версия, среда, записи — без содержимого документа. */
export const errorReport = (): string =>
  formatReport(useErrorStore.getState().log, {
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    platform: platform.desktop ? 'настольное приложение' : 'браузер',
    userAgent: navigator.userAgent,
  });

/**
 * Ловит всё, что не поймал редактор: ошибки окна и отклонённые обещания. Сам редактор при этом
 * продолжает работать, как и работал бы без журнала.
 */
export function installErrorCapture(): void {
  const { record } = useErrorStore.getState();
  window.addEventListener('error', (event) => record(event.error ?? event.message, 'error'));
  window.addEventListener('unhandledrejection', (event) => record(event.reason, 'promise'));
}
