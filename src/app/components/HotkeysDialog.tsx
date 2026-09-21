import { useEffect, useRef } from 'react';
import { HOTKEYS, HOTKEY_GROUPS } from '../hotkeys/registry';
import { Button } from '../ui';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Справка строится из того же реестра, что и обработчик, поэтому разойтись с ним не может. */
export function HotkeysDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog dialog--wide" onClose={onClose}>
      <div className="dialog-content">
        <h2>Горячие клавиши</h2>
        <div className="hotkeys">
          {HOTKEY_GROUPS.map((group) => {
            const rows = HOTKEYS.filter((h) => h.group === group && !h.hidden);
            if (rows.length === 0) return null;
            return (
              <section className="hotkeys-group" key={group}>
                <h3>{group}</h3>
                <dl>
                  {rows.map((hotkey) => (
                    <div className="hotkeys-row" key={`${hotkey.group}:${hotkey.keys}`}>
                      <dt>{hotkey.label}</dt>
                      <dd>
                        <kbd>{hotkey.keys}</kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
        <div className="dialog-actions">
          <Button variant="primary" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </dialog>
  );
}
