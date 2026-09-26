import { type FormEvent, useEffect, useRef, useState } from 'react';
import { sheetLayouts } from '../../core/spriteSheet';
import { exportSamples, hasMotion } from '../../core/timeline';
import { GIF_MAX_FPS, gifSamples } from '../io/animationExport';
import { useDocumentStore } from '../store/documentStore';
import {
  exportFramesAction,
  exportGifAction,
  exportPngAction,
  exportSpriteSheetAction,
  exportTextAction,
} from '../store/fileActions';
import { Button, Field, Select, plural, readSetting, writeSetting } from '../ui';

type Format = 'png' | 'gif' | 'sheet' | 'frames' | 'text';

const FORMATS: readonly { value: Format; label: string; hint: string }[] = [
  { value: 'png', label: 'Кадр PNG', hint: 'Сцена в момент указателя — со свечением и контуром.' },
  {
    value: 'gif',
    label: 'Анимация GIF',
    hint: `Петля для соцсетей и мессенджеров, не чаще ${GIF_MAX_FPS} кадров в секунду.`,
  },
  {
    value: 'sheet',
    label: 'Лист спрайтов',
    hint: 'PNG с атласом JSON в формате Aseprite: его понимают Unity, Godot и Phaser.',
  },
  { value: 'frames', label: 'Кадры PNG', hint: 'Каждый кадр отдельным файлом, тайминг — в JSON.' },
  { value: 'text', label: 'Текст', hint: 'Символы кадра без цвета — для терминала и заметок.' },
];

const SCALES = [8, 16, 32, 64].map((s) => ({ value: String(s), label: `${s} px на ячейку` }));
const FRAMES = { one: 'кадр', few: 'кадра', many: 'кадров' };
const SHEETS = { one: 'лист', few: 'листа', many: 'листов' };

interface Choice {
  readonly format: Format;
  readonly scale: number;
}

const DEFAULT: Choice = { format: 'png', scale: 16 };

function loadChoice(): Choice {
  const stored = readSetting<Partial<Choice>>('export', {});
  const format = FORMATS.some((f) => f.value === stored.format) ? stored.format : DEFAULT.format;
  const scale = SCALES.some((s) => s.value === String(stored.scale)) ? stored.scale : DEFAULT.scale;
  return { format: format as Format, scale: scale as number };
}

/** Что получится: размер, число кадров и листов. Считается без рендера. */
function summary(choice: Choice): string {
  const { animation, doc } = useDocumentStore.getState();
  const w = doc.width * choice.scale;
  const h = doc.height * choice.scale;
  const count = exportSamples(animation).length;
  switch (choice.format) {
    case 'png':
      return `${w}×${h} пикс.`;
    case 'gif': {
      const capped = hasMotion(animation) && animation.fps > GIF_MAX_FPS;
      const gif = plural(gifSamples(animation).length, FRAMES);
      return `${gif}, ${w}×${h} пикс.${capped ? `, частота снижена до ${GIF_MAX_FPS}` : ''}`;
    }
    case 'sheet': {
      const sheets = sheetLayouts(count, w, h);
      const { columns, rows } = sheets[0] ?? { columns: 1, rows: 1 };
      return `${plural(count, FRAMES)} на ${plural(sheets.length, SHEETS)} до ${columns * w}×${rows * h} пикс.`;
    }
    case 'frames':
      return `${plural(count, FRAMES)} по ${w}×${h} пикс. в архиве ZIP`;
    case 'text':
      return `${doc.width}×${doc.height} символов`;
  }
}

function run(choice: Choice): void {
  const actions: Record<Format, () => Promise<void>> = {
    png: () => exportPngAction(choice.scale),
    gif: () => exportGifAction(choice.scale),
    sheet: () => exportSpriteSheetAction(choice.scale),
    frames: () => exportFramesAction(choice.scale),
    text: () => exportTextAction(),
  };
  void actions[choice.format]();
}

/**
 * Экспорт одним окном: формат, масштаб и что получится. Живёт, только пока открыт, и помнит
 * последний выбор — повторный экспорт того же вида занимает одно нажатие Enter.
 */
export function ExportDialog({ onClose }: { readonly onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState(loadChoice);
  const format = FORMATS.find((f) => f.value === choice.format) ?? FORMATS[0];

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    writeSetting('export', choice);
    onClose();
    run(choice);
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      <form onSubmit={submit}>
        <h2>Экспорт</h2>
        <Field label="Формат">
          <Select
            value={choice.format}
            options={FORMATS}
            ariaLabel="Формат экспорта"
            onChange={(value) => setChoice((c) => ({ ...c, format: value }))}
          />
        </Field>
        <Field label="Масштаб">
          <Select
            value={String(choice.scale)}
            options={SCALES}
            disabled={choice.format === 'text'}
            ariaLabel="Пикселей на ячейку"
            onChange={(value) => setChoice((c) => ({ ...c, scale: Number(value) }))}
          />
        </Field>
        <p className="dim">{format.hint}</p>
        <p>{summary(choice)}</p>
        <div className="dialog-actions">
          <Button onClick={onClose}>Отмена</Button>
          <Button type="submit" variant="primary">
            Экспортировать
          </Button>
        </div>
      </form>
    </dialog>
  );
}
