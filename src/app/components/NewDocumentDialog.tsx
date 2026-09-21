import { type FormEvent, useEffect, useRef, useState } from 'react';
import { MAX_DIMENSION, MIN_DIMENSION } from '../../core/document';
import { newDocumentAction } from '../store/fileActions';

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
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="dialog-row">
          <label>
            Width, cells
            <input
              type="number"
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Height, cells
            <input
              type="number"
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              required
            />
          </label>
        </div>
        <div className="dialog-actions">
          <button type="button" className="text-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="text-btn text-btn--primary">
            Create
          </button>
        </div>
      </form>
    </dialog>
  );
}
