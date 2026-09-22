import { type FormEvent, useEffect, useRef, useState } from 'react';
import { MAX_DIMENSION, MIN_DIMENSION, type ResizeAnchor, resizeOffset } from '../../core/document';
import { resizeCanvasAction } from '../store/documentActions';
import { useDocumentStore } from '../store/documentStore';
import { AnchorPicker, Button, Field, NumberField, resizePreview } from '../ui';

interface Props {
  readonly onClose: () => void;
}

const percent = (box: { left: number; top: number; width: number; height: number }) => ({
  left: `${box.left}%`,
  top: `${box.top}%`,
  width: `${box.width}%`,
  height: `${box.height}%`,
});

/**
 * Окно живёт только пока открыто: поля тогда сами начинаются с текущего размера, и не нужен
 * эффект, сбрасывающий их на каждом открытии.
 */
export function ResizeCanvasDialog({ onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const doc = useDocumentStore((s) => s.doc);
  const [width, setWidth] = useState(doc.width);
  const [height, setHeight] = useState(doc.height);
  const [anchor, setAnchor] = useState<ResizeAnchor>('top-left');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const preview = resizePreview(doc, width, height, anchor);
  const offset = resizeOffset(doc, width, height, anchor);
  const cropped =
    preview.kept.width !== doc.width || preview.kept.height !== doc.height
      ? `Обрежется до ${preview.kept.width}×${preview.kept.height}`
      : null;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    resizeCanvasAction(width, height, anchor);
    onClose();
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <h2>Размер холста</h2>
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

        <div className="resize-row">
          <Field label="Якорь" stacked>
            <AnchorPicker value={anchor} onChange={setAnchor} ariaLabel="Якорь" />
          </Field>
          <div className="resize-preview-wrap">
            <div
              className="resize-preview"
              style={{ aspectRatio: String(preview.aspect) }}
              aria-hidden="true"
            >
              <span className="resize-preview-content" style={percent(preview.content)} />
              <span className="resize-preview-canvas" style={percent(preview.canvas)} />
            </div>
            <p className="resize-note">
              {doc.width}×{doc.height} → {width}×{height}
              <br />
              сдвиг {offset.x >= 0 ? `+${offset.x}` : offset.x},{' '}
              {offset.y >= 0 ? `+${offset.y}` : offset.y}
              {cropped && (
                <>
                  <br />
                  <span className="resize-note--warn">{cropped}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="dialog-actions">
          <Button onClick={onClose}>Отмена</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={width === doc.width && height === doc.height}
          >
            Изменить
          </Button>
        </div>
      </form>
    </dialog>
  );
}
