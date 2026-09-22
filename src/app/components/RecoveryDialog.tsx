import { useEffect, useRef, useState } from 'react';
import { type RecoverySlot, recoverableSlots } from '../../core/recovery';
import { deserialize } from '../../core/serialization';
import { autosaveService } from '../autosave/service';
import { liveSessions } from '../autosave/session';
import { useDocumentStore } from '../store/documentStore';
import { errorMessage, notify } from '../store/notifyStore';
import { Button, formatAge, plural } from '../ui';

interface Found {
  readonly slots: readonly RecoverySlot[];
  /** Когда записи нашли: от этого момента и считается их возраст. */
  readonly at: number;
}

/** Записи умерших вкладок, найденные при старте. Пока поиск идёт, окна нет. */
function useRecoverableSlots(): Found {
  const [found, setFound] = useState<Found>({ slots: [], at: 0 });
  useEffect(() => {
    let cancelled = false;
    const { store } = autosaveService();
    Promise.all([store.list(), liveSessions()])
      .then(([raw, live]) => {
        if (!cancelled) setFound({ slots: recoverableSlots(raw, live), at: Date.now() });
      })
      // Хранилище недоступно: предлагать нечего, а о самом автосохранении скажет служба.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return found;
}

/**
 * Предлагает вернуть работу, которую вкладка не успела сохранить. Закрыть окно — значит
 * «потом»: записи остаются и будут предложены при следующем запуске. Стирает их только «Удалить».
 */
export function RecoveryDialog() {
  const { slots, at: foundAt } = useRecoverableSlots();
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDialogElement>(null);
  const visible = open && slots.length > 0;

  useEffect(() => {
    const dialog = ref.current;
    if (visible && dialog && !dialog.open) dialog.showModal();
  }, [visible]);

  if (!visible) return null;

  const restore = async (slot: RecoverySlot): Promise<void> => {
    let animation;
    try {
      animation = deserialize(slot.data);
    } catch (error) {
      // Запись не стираем: её могла оставить более новая версия редактора, и там она откроется.
      notify(`Не удалось восстановить «${slot.name}»: ${errorMessage(error)}`, 'error');
      return;
    }
    const { store, autosave } = autosaveService();
    useDocumentStore.getState().replaceAnimation(animation, undefined, true);
    setOpen(false);
    // Сначала своя запись, потом стираем чужую: между ними работа не должна остаться без копии.
    await autosave.flush();
    await store.remove(slot.session).catch(() => undefined);
    notify(`«${slot.name}» восстановлен. Сохраните его в файл.`);
  };

  const discard = async (): Promise<void> => {
    setOpen(false);
    const { store } = autosaveService();
    await Promise.all(slots.map((slot) => store.remove(slot.session))).catch(() => undefined);
  };

  return (
    <dialog ref={ref} className="dialog" onClose={() => setOpen(false)}>
      <div className="dialog-content">
        <h2>Несохранённая работа</h2>
        <p className="recovery-lead">Редактор закрылся раньше, чем эту работу сохранили.</p>
        <ul className="recovery-list">
          {slots.map((slot) => (
            <li key={slot.session} className="recovery-item">
              <div className="recovery-meta">
                <span className="recovery-name">{slot.name}</span>
                <span className="recovery-details">
                  {slot.width}×{slot.height} ·{' '}
                  {plural(slot.frames, { one: 'кадр', few: 'кадра', many: 'кадров' })} ·{' '}
                  {formatAge(foundAt - slot.savedAt)}
                </span>
              </div>
              <Button variant="primary" onClick={() => void restore(slot)}>
                Восстановить
              </Button>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <Button onClick={() => void discard()}>Удалить</Button>
          <Button onClick={() => setOpen(false)}>Позже</Button>
        </div>
      </div>
    </dialog>
  );
}
