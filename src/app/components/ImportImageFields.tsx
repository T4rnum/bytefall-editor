import { MAX_DIMENSION } from '../../core/document';
import {
  type BackgroundMode,
  type DitherMode,
  type LumaWeights,
  PALETTE_PRESETS,
  RAMP_PRESETS,
} from '../../core/quantize';
import type { ImportSettings } from '../store/importSettings';
import { Checkbox, ColorField, Field, NumberField, Select, Slider, TextField } from '../ui';

interface GroupProps {
  readonly settings: ImportSettings;
  readonly onChange: (patch: Partial<ImportSettings>) => void;
}

const RAMP_OPTIONS = [
  { value: 'font', label: 'По плотности шрифта' },
  ...RAMP_PRESETS.map((r) => ({ value: r.id, label: r.label })),
  { value: 'custom', label: 'Свои символы' },
];

const PALETTE_OPTIONS = [
  { value: 'image', label: 'Как на картинке' },
  { value: 'document', label: 'Палитра документа' },
  ...PALETTE_PRESETS.map((p) => ({ value: p.id, label: p.label })),
  { value: 'mono', label: 'Один цвет' },
];

const DITHER_OPTIONS: { value: DitherMode; label: string }[] = [
  { value: 'none', label: 'Нет' },
  { value: 'bayer', label: 'Байер 4×4' },
  { value: 'noise', label: 'Шум' },
];

const BACKGROUND_OPTIONS: { value: BackgroundMode; label: string }[] = [
  { value: 'none', label: 'Прозрачный' },
  { value: 'blocks', label: 'Цветные ячейки' },
  { value: 'shaded', label: 'Символы на фоне' },
];

const WEIGHT_OPTIONS: { value: LumaWeights; label: string }[] = [
  { value: 'rec709', label: 'Как видит глаз' },
  { value: 'rec601', label: 'Как в старом ТВ' },
  { value: 'average', label: 'Поровну' },
];

function SizeGroup({ settings, onChange, height }: GroupProps & { readonly height: number }) {
  return (
    <>
      <Field label="Ширина" title="Сколько ячеек в ширину. Высота — по пропорциям картинки">
        <NumberField
          value={settings.width}
          min={1}
          max={MAX_DIMENSION}
          suffix={`× ${height}`}
          onChange={(width) => onChange({ width })}
          width="var(--field-w)"
        />
      </Field>
      <Checkbox checked={settings.fitCanvas} onChange={(fitCanvas) => onChange({ fitCanvas })}>
        Холст по размеру картинки
      </Checkbox>
    </>
  );
}

function SymbolsGroup({ settings, onChange }: GroupProps) {
  const blocks = settings.background === 'blocks';
  return (
    <>
      <h3 className="dialog-section">Символы</h3>
      <Field label="Набор" title="Символы от пустого к плотному: яркость выбирает, какой встанет">
        <Select
          value={settings.ramp}
          options={RAMP_OPTIONS}
          size="sm"
          disabled={blocks}
          ariaLabel="Набор символов"
          onChange={(ramp) => onChange({ ramp })}
        />
      </Field>
      {settings.ramp === 'custom' && !blocks && (
        <TextField
          value={settings.customRamp}
          pixel
          size="sm"
          ariaLabel="Свои символы, от пустого к плотному"
          onCommit={(customRamp) => onChange({ customRamp })}
        />
      )}
      <Field
        label="Дизеринг"
        title="Смешивает соседние символы, чтобы на плавных переходах не было полос"
      >
        <Select
          value={settings.dither}
          options={DITHER_OPTIONS}
          size="sm"
          disabled={blocks}
          ariaLabel="Дизеринг"
          onChange={(dither) => onChange({ dither })}
        />
      </Field>
      <Checkbox
        checked={settings.edges}
        disabled={blocks}
        title="На границах светлого и тёмного ставит | / - \\ по направлению контура"
        onChange={(edges) => onChange({ edges })}
      >
        Контуры чертами
      </Checkbox>
      {settings.edges && !blocks && (
        <>
          <Slider
            label="Порог"
            value={Math.round(settings.edgeThreshold * 100)}
            min={5}
            max={100}
            suffix="%"
            onChange={(v) => onChange({ edgeThreshold: v / 100 })}
          />
          <Slider
            label="Сила"
            value={Math.round(settings.edgeStrength * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(v) => onChange({ edgeStrength: v / 100 })}
          />
        </>
      )}
    </>
  );
}

function ToneGroup({ settings, onChange }: GroupProps) {
  return (
    <>
      <h3 className="dialog-section">Яркость</h3>
      <Slider
        label="Яркость"
        value={Math.round(settings.brightness * 100)}
        min={-100}
        max={100}
        suffix="%"
        onChange={(v) => onChange({ brightness: v / 100 })}
      />
      <Slider
        label="Контраст"
        value={Math.round(settings.contrast * 100)}
        min={0}
        max={300}
        suffix="%"
        onChange={(v) => onChange({ contrast: v / 100 })}
      />
      <Field label="Гамма" title="Больше единицы — светлее средние тона, меньше — темнее">
        <NumberField
          value={settings.gamma}
          min={0.2}
          max={5}
          step={0.1}
          onChange={(gamma) => onChange({ gamma })}
          width="var(--field-w)"
        />
      </Field>
      <Field label="Веса" title="Как смешать красный, зелёный и синий в яркость">
        <Select
          value={settings.weights}
          options={WEIGHT_OPTIONS}
          size="sm"
          ariaLabel="Веса яркости"
          onChange={(weights) => onChange({ weights })}
        />
      </Field>
      <Checkbox
        checked={settings.invert}
        title="Для светлого холста: тёмное становится плотным, а не пустым"
        onChange={(invert) => onChange({ invert })}
      >
        Светлый холст
      </Checkbox>
    </>
  );
}

function ColorGroup({ settings, onChange }: GroupProps) {
  return (
    <>
      <h3 className="dialog-section">Цвет</h3>
      <Field label="Фон" title="Символы без фона, только цветные ячейки или символы на своём цвете">
        <Select
          value={settings.background}
          options={BACKGROUND_OPTIONS}
          size="sm"
          ariaLabel="Фон ячеек"
          onChange={(background) => onChange({ background })}
        />
      </Field>
      <Field label="Палитра">
        <Select
          value={settings.palette}
          options={PALETTE_OPTIONS}
          size="sm"
          ariaLabel="Палитра"
          onChange={(palette) => onChange({ palette })}
        />
      </Field>
      {settings.palette === 'mono' && (
        <ColorField
          label="Цвет"
          value={settings.monoColor}
          size="sm"
          onChange={(color) => color && onChange({ monoColor: color })}
        />
      )}
      <Checkbox
        checked={settings.vivid}
        disabled={settings.background === 'blocks'}
        title="Символ — чистым оттенком на полной яркости: яркость и так несёт его плотность"
        onChange={(vivid) => onChange({ vivid })}
      >
        Яркие цвета символов
      </Checkbox>
    </>
  );
}

/** Все настройки импорта. Меняются живьём: холст за окном сразу показывает результат. */
export function ImportImageFields(props: GroupProps & { readonly height: number }) {
  return (
    <>
      <SizeGroup {...props} />
      <SymbolsGroup {...props} />
      <ToneGroup {...props} />
      <ColorGroup {...props} />
    </>
  );
}
