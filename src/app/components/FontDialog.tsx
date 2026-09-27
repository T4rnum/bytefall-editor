import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react';
import {
  BUILTIN_FONT,
  type DocumentFont,
  MAX_FONT_CELL,
  MIN_FONT_CELL,
  cellAspect,
  sameFont,
  validCell,
} from '../../core/font/font';
import { type GlyphLook, loadDocumentFont, readFontFile } from '../../render/font/documentFont';
import { openFontFile } from '../io/files';
import { setDocumentFontAction } from '../store/documentActions';
import { useDocumentStore } from '../store/documentStore';
import { errorMessage } from '../store/notifyStore';
import { Button, Field, GlyphFace, NumberField, resetTo } from '../ui';

const KIND_LABEL: Record<DocumentFont['kind'], string> = {
  builtin: 'встроенный',
  vector: 'TTF/OTF',
  tileset: 'лист CP437',
};

const SAMPLE = [...'Bytefall 0123 ░▒▓█ ╔═╗ ☺♥'];
const SAMPLE_HEIGHT = 32;

/** Вид символов шрифта-кандидата: грузится, пока окно открыто, как и шрифт холста. */
function useLook(font: DocumentFont): { look: GlyphLook | null; error: string | null } {
  const [state, setState] = useState<{ key: string; look: GlyphLook | null; error: string | null }>(
    { key: '', look: null, error: null },
  );
  const key = `${font.id}:${font.cellWidth}x${font.cellHeight}`;
  useEffect(() => {
    let cancelled = false;
    loadDocumentFont(font)
      .then((loaded) => !cancelled && setState({ key, look: loaded.look, error: null }))
      .catch((e: unknown) => !cancelled && setState({ key, look: null, error: errorMessage(e) }));
    return () => {
      cancelled = true;
    };
    // Ключ описывает шрифт целиком: отпечаток и ячейка.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { look: null, error: null };
}

/** Образец: символы в своих ячейках, чтобы была видна и форма ячейки. */
function Sample({ font, look }: { readonly font: DocumentFont; readonly look: GlyphLook }) {
  const scale = Math.max(1, Math.floor(SAMPLE_HEIGHT / font.cellHeight));
  const cell: CSSProperties = {
    width: `${font.cellWidth * scale}px`,
    height: `${font.cellHeight * scale}px`,
  };
  return (
    <div className="font-sample" aria-label="Образец шрифта">
      {SAMPLE.map((ch, i) => (
        <span key={i} className="font-sample-cell" style={cell}>
          <GlyphFace glyph={ch} look={look} height={SAMPLE_HEIGHT} />
        </span>
      ))}
    </div>
  );
}

/**
 * Шрифт документа: встроенный или свой — TTF/OTF или лист символов CP437 в PNG. Ячейка своего
 * шрифта находится сама; у векторного её можно поправить. Окно живёт, только пока открыто.
 */
export function FontDialog({ onClose }: { readonly onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const current = useDocumentStore((s) => s.animation.font);
  const [font, setFont] = useState(current);
  const [detected, setDetected] = useState({ w: current.cellWidth, h: current.cellHeight });
  const [pickError, setPickError] = useState<string | null>(null);
  const { look, error } = useLook(font);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const choose = (next: DocumentFont): void => {
    setFont(next);
    setDetected({ w: next.cellWidth, h: next.cellHeight });
    setPickError(null);
  };

  const pick = async (): Promise<void> => {
    try {
      const file = await openFontFile();
      if (file) choose(await readFontFile(file.name, file.bytes));
    } catch (e) {
      setPickError(`Не подошёл: ${errorMessage(e)}`);
    }
  };

  const setCell = (cellWidth: number, cellHeight: number): void => {
    if (validCell(cellWidth, cellHeight)) setFont((f) => ({ ...f, cellWidth, cellHeight }));
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setDocumentFontAction(font);
    onClose();
  };

  const reshaped = cellAspect(font) !== cellAspect(current);
  const problem = pickError ?? (error ? `Шрифт не загрузился: ${error}` : null);

  return (
    <dialog ref={ref} className="dialog dialog--font" onClose={onClose}>
      <form onSubmit={submit}>
        <h2>Шрифт документа</h2>
        <p>
          {font.name} · {KIND_LABEL[font.kind]} · ячейка {font.cellWidth}×{font.cellHeight} пикс.
        </p>
        <div className="dialog-actions dialog-actions--start">
          <Button disabled={font.kind === 'builtin'} onClick={() => choose(BUILTIN_FONT)}>
            Встроенный: {BUILTIN_FONT.name}
          </Button>
          <Button onClick={() => void pick()}>Загрузить TTF, OTF или лист PNG…</Button>
        </div>
        {font.kind === 'vector' && (
          <div className="dialog-row">
            <Field
              label="Ширина ячейки"
              stacked
              onReset={resetTo(font.cellWidth, detected.w, (w) => setCell(w, font.cellHeight))}
            >
              <NumberField
                value={font.cellWidth}
                min={MIN_FONT_CELL}
                max={MAX_FONT_CELL}
                onChange={(w) => setCell(w, font.cellHeight)}
                width="100%"
              />
            </Field>
            <Field
              label="Высота ячейки"
              stacked
              onReset={resetTo(font.cellHeight, detected.h, (h) => setCell(font.cellWidth, h))}
            >
              <NumberField
                value={font.cellHeight}
                min={MIN_FONT_CELL}
                max={MAX_FONT_CELL}
                onChange={(h) => setCell(font.cellWidth, h)}
                width="100%"
              />
            </Field>
          </div>
        )}
        {look && <Sample font={font} look={look} />}
        {problem && <p className="dialog-error">{problem}</p>}
        <p className="dim">
          Свой шрифт сохраняется в документе целиком: файл откроется так же на любой машине.
          {font.kind === 'tileset' &&
            ' Лист — 16×16 символов в порядке CP437; символ — светлое на тёмном или прозрачном.'}
          {reshaped &&
            ` Форма ячейки меняется: ${current.cellWidth}×${current.cellHeight} → ${font.cellWidth}×${font.cellHeight}. Ячейки остаются на местах, пропорции рисунка меняются.`}
        </p>
        <div className="dialog-actions">
          <Button onClick={onClose}>Отмена</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={sameFont(font, current) || error !== null}
          >
            Применить
          </Button>
        </div>
      </form>
    </dialog>
  );
}
