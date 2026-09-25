import { formatPalette, parsePalette } from '../../core/paletteFile';
import { loadPaletteFileAction } from '../store/importActions';
import { Button, Field, TextField, plural } from '../ui';

const COLOR_FORMS = { one: 'цвет', few: 'цвета', many: 'цветов' };

/**
 * Своя палитра импорта: цвета списком — через пробел, запятую, с решёткой и без — или из файла
 * палитры Lospec, GIMP, JASC, Paint.NET. Пустая палитра означает цвета картинки.
 */
export function CustomPaletteFields({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (palette: string) => void;
}) {
  const colors = parsePalette(value);
  const load = async (): Promise<void> => {
    const loaded = await loadPaletteFileAction();
    if (loaded !== null) onChange(loaded);
  };
  return (
    <>
      <Field label="Цвета" stacked>
        <TextField
          value={value}
          size="sm"
          ariaLabel="Цвета палитры: hex через пробел или запятую"
          onCommit={(text) => onChange(formatPalette(parsePalette(text)))}
        />
      </Field>
      {colors.length > 0 ? (
        <div className="palette palette--preview" role="list" aria-label="Своя палитра">
          {colors.map((color) => (
            <span
              key={color}
              role="listitem"
              className="palette-swatch"
              style={{ background: color }}
              title={color}
            />
          ))}
        </div>
      ) : (
        <p className="dim">Вставь цвета или загрузи файл палитры. Пока берутся цвета картинки.</p>
      )}
      <Field label={plural(colors.length, COLOR_FORMS)}>
        <Button size="sm" onClick={() => void load()}>
          Из файла…
        </Button>
      </Field>
    </>
  );
}
