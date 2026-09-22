import { type FormEvent, useEffect, useRef, useState } from 'react';
import { MAX_DIMENSION, MIN_DIMENSION } from '../../core/document';
import { newDocumentAction } from '../store/fileActions';
import { Button, Field, NumberField, TextField } from '../ui';

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function NewDocumentDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('Без названия');
  const [width, setWidth] = useState(64);
  const [height, setHeight] = useState(32);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    newDocumentAction({ name, width, height });
    onClose();
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <h2>Новый документ</h2>
        <Field label="Имя" stacked>
          <TextField value={name} ariaLabel="Имя документа" onCommit={setName} />
        </Field>
        <div className="dialog-row">
          <Field label="Ширина, ячеек" stacked>
            <NumberField
              value={width}
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              onChange={setWidth}
              width="100%"
            />
          </Field>
          <Field label="Высота, ячеек" stacked>
            <NumberField
              value={height}
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              onChange={setHeight}
              width="100%"
            />
          </Field>
        </div>
        <div className="dialog-actions">
          <Button onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="primary">
            Создать
          </Button>
        </div>
      </form>
    </dialog>
  );
}
