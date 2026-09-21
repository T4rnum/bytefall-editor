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
  const [name, setName] = useState('Untitled');
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
        <h2>New document</h2>
        <Field label="Name" stacked>
          <TextField value={name} ariaLabel="Document name" onCommit={setName} />
        </Field>
        <div className="dialog-row">
          <Field label="Width, cells" stacked>
            <NumberField
              value={width}
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              onChange={setWidth}
              width="100%"
            />
          </Field>
          <Field label="Height, cells" stacked>
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
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Create
          </Button>
        </div>
      </form>
    </dialog>
  );
}
