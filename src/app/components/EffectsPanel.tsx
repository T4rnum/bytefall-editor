import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { findLayer } from '../../core/document';
import {
  EFFECT_KINDS,
  type EffectByKind,
  type EffectKind,
  type LayerEffect,
} from '../../core/effects';
import { useDocumentStore } from '../store/documentStore';
import { addEffectAction, removeEffectAction, updateEffectAction } from '../store/effectActions';
import {
  Button,
  Checkbox,
  Field,
  FieldGroup,
  NumberField,
  Panel,
  Select,
  type SelectOption,
  TextField,
} from '../ui';

/** Описание поля эффекта; ключ проверяется компилятором против интерфейса эффекта. */
type EffectField<K extends string = string> =
  | {
      readonly key: K;
      readonly label: string;
      readonly type: 'number';
      readonly min: number;
      readonly max: number;
      readonly step: number;
    }
  | { readonly key: K; readonly label: string; readonly type: 'text' }
  | { readonly key: K; readonly label: string; readonly type: 'boolean' }
  | {
      readonly key: K;
      readonly label: string;
      readonly type: 'select';
      readonly options: readonly SelectOption<string>[];
    };

type FieldsByKind = {
  readonly [K in EffectKind]: readonly EffectField<Extract<keyof EffectByKind[K], string>>[];
};

const num = <K extends string>(
  key: K,
  label: string,
  min: number,
  max: number,
  step: number,
): EffectField<K> => ({
  key,
  label,
  type: 'number',
  min,
  max,
  step,
});
/** Значения палитр живут в файле, поэтому остаются английскими; подписи — для людей. */
const FIRE_PALETTE_OPTIONS: readonly SelectOption<string>[] = [
  { value: 'fire', label: 'Огонь' },
  { value: 'ice', label: 'Лёд' },
  { value: 'toxic', label: 'Яд' },
];

const period = num('period', 'Период, мс', 10, 600000, 50);

/** Описание полей каждого эффекта: панель рисует их одинаково. */
const FIELDS: FieldsByKind = {
  pulse: [
    period,
    num('amplitude', 'Амплитуда', 0, 1, 0.05),
    num('spread', 'Разброс', -10, 10, 0.1),
  ],
  wave: [
    period,
    num('amplitude', 'Амплитуда', 0, 64, 1),
    num('wavelength', 'Длина волны', 1, 1024, 1),
  ],
  flicker: [period, num('density', 'Плотность', 0, 1, 0.05)],
  scroll: [
    num('dx', 'dx, ячеек/с', -1000, 1000, 1),
    num('dy', 'dy, ячеек/с', -1000, 1000, 1),
    { key: 'wrap', label: 'По кругу', type: 'boolean' },
  ],
  cycle: [
    { key: 'glyphs', label: 'Символы', type: 'text' },
    period,
    num('spread', 'Разброс', -10, 10, 0.1),
  ],
  fire: [
    num('height', 'Высота', 1, 64, 1),
    period,
    { key: 'palette', label: 'Палитра', type: 'select', options: FIRE_PALETTE_OPTIONS },
    { key: 'glyphs', label: 'Ряд символов', type: 'text' },
  ],
};

const kindLabel = (kind: EffectKind): string =>
  EFFECT_KINDS.find((k) => k.kind === kind)?.label ?? kind;

function FieldEditor({ effect, field }: { effect: LayerEffect; field: EffectField }) {
  const values = effect as unknown as Record<string, string | number | boolean>;
  const value = values[field.key];
  const commit = (next: string | number | boolean): void => {
    if (next === value) return;
    updateEffectAction(effect, { [field.key]: next });
  };

  if (field.type === 'boolean') {
    return (
      <Checkbox checked={Boolean(value)} onChange={commit}>
        {field.label}
      </Checkbox>
    );
  }
  if (field.type === 'select') {
    return (
      <Field label={field.label}>
        <Select
          value={String(value)}
          options={field.options}
          size="sm"
          ariaLabel={field.label}
          onChange={commit}
        />
      </Field>
    );
  }
  if (field.type === 'text') {
    return (
      <Field label={field.label}>
        <TextField
          value={String(value)}
          size="sm"
          pixel
          ariaLabel={field.label}
          onCommit={commit}
        />
      </Field>
    );
  }
  return (
    <Field label={field.label}>
      <NumberField
        value={Number(value)}
        min={field.min}
        max={field.max}
        step={field.step}
        onCommit={commit}
        onChange={commit}
        width="var(--field-w-sm)"
      />
    </Field>
  );
}

/** Эффекты активного слоя: список с параметрами и добавление нового. */
export function EffectsPanel() {
  const doc = useDocumentStore((s) => s.doc);
  const activeLayerId = useDocumentStore((s) => s.activeLayerId);
  const [kind, setKind] = useState<EffectKind>('fire');
  const layer = findLayer(doc, activeLayerId);
  if (!layer) return null;

  return (
    <Panel
      id="effects"
      title="Эффекты"
      badge={layer.name}
      actions={
        <>
          <Select
            value={kind}
            options={EFFECT_KINDS.map((k) => ({ value: k.kind, label: k.label }))}
            size="sm"
            ariaLabel="Какой эффект добавить"
            onChange={setKind}
          />
          <Button
            icon
            size="sm"
            label="Добавить эффект активному слою"
            onClick={() => addEffectAction(kind)}
          >
            <Plus size={14} />
          </Button>
        </>
      }
    >
      {layer.effects.length === 0 ? (
        <p className="panel-hint">Эффекты анимируют слой, не меняя его ячейки. Попробуй «Огонь».</p>
      ) : (
        <ul className="fx-list">
          {layer.effects.map((effect) => (
            <li key={effect.id} className="fx-row">
              <div className="fx-head">
                <Checkbox
                  checked={effect.enabled}
                  onChange={(enabled) => updateEffectAction(effect, { enabled })}
                >
                  <span className="fx-name">{kindLabel(effect.kind)}</span>
                </Checkbox>
                <Button
                  icon
                  size="sm"
                  variant="danger"
                  label="Удалить эффект"
                  onClick={() => removeEffectAction(effect.id)}
                >
                  <X size={12} />
                </Button>
              </div>
              <FieldGroup columns={2} className="fx-fields">
                {FIELDS[effect.kind].map((field) => (
                  <FieldEditor key={field.key} effect={effect} field={field} />
                ))}
              </FieldGroup>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
