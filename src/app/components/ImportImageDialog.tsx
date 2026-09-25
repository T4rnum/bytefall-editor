import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { type ConvertedImage, isDocumentEmpty } from '../../core/imageLayer';
import { cellsHighFor, quantize, sampleImage } from '../../core/quantize';
import type { GlyphAtlas } from '../../render/font/GlyphAtlas';
import { useDocumentStore } from '../store/documentStore';
import {
  applyImageImportAction,
  closeImageImport,
  previewImageImport,
} from '../store/importActions';
import {
  type ImportSettings,
  defaultSettings,
  initialSettings,
  quantizeOptionsOf,
  saveStyle,
} from '../store/importSettings';
import { type ImageImportSource, useUiStore } from '../store/uiStore';
import { fitViewAction } from '../store/viewActions';
import { Button } from '../ui';
import { ImportImageFields } from './ImportImageFields';

interface BodyProps {
  readonly source: ImageImportSource;
  readonly atlas: GlyphAtlas;
}

/**
 * Настройки и результат конвертации. Дорогая часть — проход по пикселям — пересчитывается только
 * при смене ширины, выбор символов — на каждое изменение настроек.
 */
function useConversion(source: ImageImportSource, settings: ImportSettings, atlas: GlyphAtlas) {
  const palette = useDocumentStore((s) => s.doc.palette);
  const { image, name } = source;
  const height = cellsHighFor(image, settings.width);
  const samples = useMemo(
    () => sampleImage(image, settings.width, height),
    [image, settings.width, height],
  );
  const options = useMemo(
    () =>
      quantizeOptionsOf(settings, { coverage: (g) => atlas.coverage(g), documentPalette: palette }),
    [settings, atlas, palette],
  );
  return useMemo(
    (): ConvertedImage => ({
      name,
      width: settings.width,
      height,
      cells: quantize(samples, options),
    }),
    [name, settings.width, height, samples, options],
  );
}

/**
 * Окно живёт, пока открыт импорт одной картинки: настройки начинаются с прошлого стиля и
 * размера по картинке, эффект их сбрасывать не нужен.
 */
function ImportImageDialogBody({ source, atlas }: BodyProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Холст на время предпросмотра меняет размер: ширина по умолчанию считается от того, что был.
  const [start] = useState(() => {
    const { doc, animation } = useDocumentStore.getState();
    return { doc: { width: doc.width }, fit: isDocumentEmpty(animation) };
  });
  const [settings, setSettings] = useState(() =>
    initialSettings(source.image, start.doc, start.fit),
  );
  const converted = useConversion(source, settings, atlas);

  // Не модальное окно: холст за ним можно двигать и приближать, чтобы разглядеть результат.
  // Инструменты и правки документа при этом заперты, см. `importOpen` во вьюпорте и клавишах.
  useEffect(() => {
    ref.current?.show();
  }, []);
  useEffect(() => {
    previewImageImport(converted, settings.fitCanvas);
  }, [converted, settings.fitCanvas]);
  // Холст под картинкой мог стать другого размера: камера вписывает то, что теперь на экране.
  useEffect(() => {
    const frame = requestAnimationFrame(fitViewAction);
    return () => cancelAnimationFrame(frame);
  }, [settings.fitCanvas]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    saveStyle(settings);
    applyImageImportAction(converted, settings.fitCanvas);
  };

  const { image } = source;
  return (
    <dialog
      ref={ref}
      className="dialog dialog--side dialog--floating"
      onClose={closeImageImport}
      onKeyDown={(event) => {
        if (event.key === 'Escape') closeImageImport();
      }}
    >
      <form onSubmit={submit}>
        <h2>Картинка в символы</h2>
        <p className="dim">
          {source.name}, {image.width}×{image.height} пикс. Результат виден на холсте.
        </p>
        <ImportImageFields
          settings={settings}
          defaults={defaultSettings(image, start.doc, settings.fitCanvas)}
          height={converted.height}
          onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
        />
        <div className="dialog-actions">
          {/* Прямо, а не через close(): событие close приходит асинхронно, а черновик на холсте
              должен исчезнуть сразу. */}
          <Button onClick={closeImageImport}>Отмена</Button>
          <Button type="submit" variant="primary">
            Вставить слоем
          </Button>
        </div>
      </form>
    </dialog>
  );
}

/** Импорт картинки: открывается выбором файла (Ctrl+I) или перетаскиванием в окно. */
export function ImportImageDialog({ atlas }: { readonly atlas: GlyphAtlas }) {
  const source = useUiStore((s) => s.imageImport);
  if (!source) return null;
  return (
    <ImportImageDialogBody
      key={`${source.name}:${source.image.width}`}
      source={source}
      atlas={atlas}
    />
  );
}
