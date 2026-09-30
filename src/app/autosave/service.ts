import { errorMessage, notify } from '../store/notifyStore';
import { useUiStore } from '../store/uiStore';
import { type Autosave, startAutosave } from './autosave';
import { SESSION_ID, holdSessionLock } from './session';
import { type ExitStore, type SlotStore, indexedDbStore, localExitStore } from './slotStore';

export interface AutosaveService {
  readonly store: SlotStore;
  /** Копии, сделанные на уходе со страницы: их окно восстановления читает вместе с записями. */
  readonly exit: ExitStore;
  readonly autosave: Autosave;
}

let service: AutosaveService | null = null;

/**
 * Автосохранение живёт столько же, сколько вкладка, и к React отношения не имеет: оно слушает
 * стор документа. Поэтому это служба, которая заводится при первом обращении, а не состояние
 * компонента. Окно восстановления и хук видимости обращаются к одному и тому же экземпляру.
 */
export function autosaveService(): AutosaveService {
  if (service) return service;
  const store = indexedDbStore();
  const exit = localExitStore();
  holdSessionLock(SESSION_ID);
  let warned = false;
  const autosave = startAutosave({
    store,
    exit,
    session: SESSION_ID,
    onSaved: (at) => useUiStore.getState().setAutosaveStatus({ at, failed: false }),
    onError: (error) => {
      useUiStore.getState().setAutosaveStatus({ at: null, failed: true });
      // Одного предупреждения хватает: повторять его на каждую неудачную запись — шум.
      if (warned) return;
      warned = true;
      notify(`Автосохранение недоступно: ${errorMessage(error)}`, 'error');
    },
  });
  service = { store, exit, autosave };
  return service;
}
