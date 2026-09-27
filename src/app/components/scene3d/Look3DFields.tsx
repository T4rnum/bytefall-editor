import { useRef } from 'react';
import {
  type BackgroundMode,
  type DitherMode,
  PALETTE_PRESETS,
  type QuantizeOptions,
  RAMP_PRESETS,
} from '../../../core/quantize';
import { DEFAULT_QUANTIZE_3D } from '../../../core/scene3d/types';
import { setQuantize3DAction } from '../../store/scene3dActions';
import {
  Checkbox,
  Field,
  NumberField,
  Select,
  type SelectOption,
  TextField,
  resetTo,
} from '../../ui';

const DITHERS: readonly SelectOption<DitherMode>[] = [
  { value: 'none', label: 'Нет' },
  { value: 'bayer', label: 'Байер 4×4' },
  { value: 'noise', label: 'Шум' },
];

const BACKGROUNDS: readonly SelectOption<BackgroundMode>[] = [
  { value: 'none', label: 'Символы без фона' },
  { value: 'shaded', label: 'Символы на фоне' },
  { value: 'blocks', label: 'Только фон' },
];

const RAMPS: readonly SelectOption<string>[] = [
  ...RAMP_PRESETS.map((r) => ({ value: r.glyphs, label: r.label })),
  { value: '', label: 'Своя' },
];

const PALETTES: readonly SelectOption<string>[] = [
  { value: '', label: 'Цвета сцены' },
  ...PALETTE_PRESETS.map((p) => ({ value: p.id, label: p.label })),
];

/**
 * Как рендер становится символами: рампа по свету, контуры по силуэту и рёбрам, дизеринг, фон
 * и палитра — те же настройки, что у импорта картинки. Во всех кадрах, ключами не ведутся.
 */
interface LookNumberProps {
  readonly layerId: string;
  readonly quantize: QuantizeOptions;
  readonly field: 'contrast' | 'brightness' | 'edgeThreshold';
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

/** Число вида: записи одного жеста склеиваются, сброс — отдельная запись. */
function LookNumber({ layerId, quantize, field, label, min, max }: LookNumberProps) {
  const gesture = useRef(0);
  const set = (value: number): void =>
    setQuantize3DAction(layerId, { [field]: value }, `look:${field}:${gesture.current}`);
  const reset = resetTo(quantize[field], DEFAULT_QUANTIZE_3D[field], (v) =>
    setQuantize3DAction(layerId, { [field]: v }),
  );
  return (
    <Field label={label} onReset={reset}>
      <NumberField
        value={quantize[field]}
        min={min}
        max={max}
        step={0.05}
        onChange={set}
        onCommit={(v) => {
          set(v);
          gesture.current += 1;
        }}
        width="var(--field-w)"
      />
      <span className="key-spacer" aria-hidden="true" />
    </Field>
  );
}

export function Look3DFields({
  layerId,
  quantize,
}: {
  layerId: string;
  quantize: QuantizeOptions;
}) {
  const set = (patch: Partial<QuantizeOptions>): void => setQuantize3DAction(layerId, patch);
  const preset = RAMP_PRESETS.some((r) => r.glyphs === quantize.ramp) ? quantize.ramp : '';
  const palette =
    PALETTE_PRESETS.find((p) => p.colors.join() === quantize.palette?.join())?.id ?? '';
  const number = (field: LookNumberProps['field'], label: string, min: number, max: number) => (
    <LookNumber
      layerId={layerId}
      quantize={quantize}
      field={field}
      label={label}
      min={min}
      max={max}
    />
  );
  return (
    <>
      <Field label="Символы">
        <Select
          value={preset}
          options={RAMPS}
          size="sm"
          ariaLabel="Рампа символов"
          onChange={(ramp) => ramp && set({ ramp })}
        />
        <span className="key-spacer" aria-hidden="true" />
      </Field>
      {preset === '' && (
        <Field label="Ряд, от пустого к плотному" stacked>
          <TextField
            value={quantize.ramp}
            size="sm"
            pixel
            ariaLabel="Свой ряд символов"
            onCommit={(ramp) => ramp.length > 0 && set({ ramp: ramp.slice(0, 256) })}
          />
        </Field>
      )}
      <Field label="Контуры">
        <Checkbox checked={quantize.edges} onChange={(edges) => set({ edges })}>
          Силуэт и рёбра
        </Checkbox>
      </Field>
      {quantize.edges && number('edgeThreshold', 'Порог контура', 0, 1)}
      {number('contrast', 'Контраст', 0, 3)}
      {number('brightness', 'Яркость', -1, 1)}
      <Field label="Дизеринг">
        <Select
          value={quantize.dither}
          options={DITHERS}
          size="sm"
          ariaLabel="Дизеринг"
          onChange={(dither) => set({ dither })}
        />
        <span className="key-spacer" aria-hidden="true" />
      </Field>
      <Field label="Фон">
        <Select
          value={quantize.background}
          options={BACKGROUNDS}
          size="sm"
          ariaLabel="Фон ячеек"
          onChange={(background) => set({ background })}
        />
        <span className="key-spacer" aria-hidden="true" />
      </Field>
      <Field label="Палитра">
        <Select
          value={palette}
          options={PALETTES}
          size="sm"
          ariaLabel="Палитра"
          onChange={(id) =>
            set({ palette: PALETTE_PRESETS.find((p) => p.id === id)?.colors ?? null })
          }
        />
        <span className="key-spacer" aria-hidden="true" />
      </Field>
      <Field label="Цвет символа">
        <Checkbox checked={quantize.vivid} onChange={(vivid) => set({ vivid })}>
          Чистый оттенок
        </Checkbox>
      </Field>
    </>
  );
}
