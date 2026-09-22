import type { Animation } from '../../core/animation';
import { makeRecoverySlot } from '../../core/recovery';
import { useDocumentStore } from '../store/documentStore';
import type { SlotStore } from './slotStore';

/** Пауза в правках, после которой пишем: запись попадает между мазками, а не посреди них. */
export const QUIET_MS = 2000;
/** Дольше этого без записи не живём, даже если правки идут без пауз. */
export const MAX_WAIT_MS = 20000;

export interface AutosaveOptions {
  readonly store: SlotStore;
  readonly session: string;
  readonly quietMs?: number;
  readonly maxWaitMs?: number;
  readonly now?: () => number;
  readonly onSaved?: (at: number) => void;
  readonly onError?: (error: unknown) => void;
}

export interface Autosave {
  /** Записать прямо сейчас: вкладку прячут, закрывают или только что восстановили работу. */
  flush(): Promise<void>;
  stop(): void;
}

/**
 * Пишет несохранённый документ в запись своей сессии и стирает её, как только документ чист.
 * Чистота — единственный признак: после сохранения в файл, создания нового документа и
 * открытия чужого терять уже нечего, а новый и открытый появляются только после подтверждения.
 */
export function startAutosave(options: AutosaveOptions): Autosave {
  const { store, session, onSaved, onError } = options;
  const quietMs = options.quietMs ?? QUIET_MS;
  const maxWaitMs = options.maxWaitMs ?? MAX_WAIT_MS;
  const now = options.now ?? Date.now;

  let quiet: ReturnType<typeof setTimeout> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  /** Последняя записанная версия: её повторная запись ничего не защищает. */
  let written: Animation | null = null;
  /** Записи идут цепочкой, иначе медленная старая могла бы лечь поверх быстрой новой. */
  let chain: Promise<void> = Promise.resolve();

  const clearTimers = (): void => {
    if (quiet) clearTimeout(quiet);
    if (deadline) clearTimeout(deadline);
    quiet = null;
    deadline = null;
  };

  const flush = (): Promise<void> => {
    clearTimers();
    const { animation, dirty } = useDocumentStore.getState();
    if (!dirty || animation === written) return chain;
    const slot = makeRecoverySlot(session, animation, now());
    chain = chain
      .then(() => store.put(slot))
      .then(
        () => {
          written = animation;
          onSaved?.(slot.savedAt);
        },
        (error: unknown) => onError?.(error),
      );
    return chain;
  };

  const forget = (): void => {
    clearTimers();
    written = null;
    chain = chain.then(() => store.remove(session)).catch((error: unknown) => onError?.(error));
  };

  const unsubscribe = useDocumentStore.subscribe((state, prev) => {
    if (state.animation === prev.animation && state.dirty === prev.dirty) return;
    if (!state.dirty) {
      forget();
      return;
    }
    if (quiet) clearTimeout(quiet);
    quiet = setTimeout(() => void flush(), quietMs);
    deadline ??= setTimeout(() => void flush(), maxWaitMs);
  });

  return {
    flush,
    stop: () => {
      unsubscribe();
      clearTimers();
    },
  };
}
