import { useEffect, useRef, useState } from 'react';
import { errorReport, useErrorStore } from '../store/errorStore';
import { useUiStore } from '../store/uiStore';
import { Button } from '../ui';

const time = (at: number): string =>
  new Date(at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

/**
 * Журнал ошибок: что ломалось и когда. Отчёт копируется целиком, без содержимого документа —
 * его можно прислать, не боясь отдать рисунок.
 */
export function ErrorLogDialog() {
  const open = useUiStore((s) => s.errorsOpen);
  const setOpen = useUiStore((s) => s.setErrorsOpen);
  const log = useErrorStore((s) => s.log);
  const clear = useErrorStore((s) => s.clear);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = (): void => {
    setOpen(false);
    setCopied(false);
  };

  return (
    <dialog ref={ref} className="dialog dialog--wide" onClose={close}>
      <div className="dialog-content">
        <h2>Журнал ошибок</h2>
        {log.length === 0 ? (
          <p className="dim">Ошибок не было.</p>
        ) : (
          <ol className="error-log">
            {[...log].reverse().map((e, i) => (
              <li key={`${e.at}:${i}`}>
                <span className="dim">{time(e.at)}</span> {e.name}: {e.message}
              </li>
            ))}
          </ol>
        )}
        <p className="dim">
          В журнале нет содержимого документа: текст в кавычках вычищен, в стеке — только пути
          модулей редактора.
        </p>
        <div className="dialog-actions">
          <Button disabled={log.length === 0} onClick={clear}>
            Очистить
          </Button>
          <Button
            disabled={log.length === 0}
            onClick={() =>
              void navigator.clipboard.writeText(errorReport()).then(() => setCopied(true))
            }
          >
            {copied ? 'Отчёт скопирован' : 'Скопировать отчёт'}
          </Button>
          <Button variant="primary" onClick={close}>
            Закрыть
          </Button>
        </div>
      </div>
    </dialog>
  );
}
