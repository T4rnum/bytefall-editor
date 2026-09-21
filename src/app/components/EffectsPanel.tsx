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

/** Поле панели; ключ проверяется компилятором против интерфейса эффекта. */
type Field<K extends string = string> =
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
      readonly options: readonly string[];
    };

type FieldsByKind = {
  readonly [K in EffectKind]: readonly Field<Extract<keyof EffectByKind[K], string>>[];
};

const num = <K extends string>(
  key: K,
  label: string,
  min: number,
  max: number,
  step: number,
): Field<K> => ({
  key,
  label,
  type: 'number',
  min,
  max,
  step,
});
const period = num('period', 'Period ms', 10, 600000, 50);

/** Описание полей каждого эффекта: панель рисует их одинаково. */
const FIELDS: FieldsByKind = {
  pulse: [period, num('amplitude', 'Amplitude', 0, 1, 0.05), num('spread', 'Spread', -10, 10, 0.1)],
  wave: [
    period,
    num('amplitude', 'Amplitude', 0, 64, 1),
    num('wavelength', 'Wavelength', 1, 1024, 1),
  ],
  flicker: [period, num('density', 'Density', 0, 1, 0.05)],
  scroll: [
    num('dx', 'dx cells/s', -1000, 1000, 1),
    num('dy', 'dy cells/s', -1000, 1000, 1),
    { key: 'wrap', label: 'Wrap', type: 'boolean' },
  ],
  cycle: [
    { key: 'glyphs', label: 'Glyphs', type: 'text' },
    period,
    num('spread', 'Spread', -10, 10, 0.1),
  ],
  fire: [
    num('height', 'Height', 1, 64, 1),
    period,
    { key: 'palette', label: 'Palette', type: 'select', options: ['fire', 'ice', 'toxic'] },
    { key: 'glyphs', label: 'Glyph ramp', type: 'text' },
  ],
};

const label = (kind: EffectKind): string =>
  EFFECT_KINDS.find((k) => k.kind === kind)?.label ?? kind;

function FieldEditor({ effect, field }: { effect: LayerEffect; field: Field }) {
  const values = effect as unknown as Record<string, string | number | boolean>;
  const value = values[field.key];
  const commit = (next: string | number | boolean): void => {
    if (next === value) return;
    updateEffectAction(effect, { [field.key]: next });
  };
  const inputKey = `${effect.id}:${field.key}:${String(value)}`;

  switch (field.type) {
    case 'boolean':
      return (
        <label className="fx-field">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => commit(e.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      );
    case 'select':
      return (
        <label className="fx-field">
          <span>{field.label}</span>
          <select
            className="select select--small"
            value={String(value)}
            onChange={(e) => commit(e.target.value)}
          >
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
    case 'text':
      return (
        <label className="fx-field">
          <span>{field.label}</span>
          <input
            key={inputKey}
            className="prop-input glyph-text"
            defaultValue={String(value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
      );
    default:
      return (
        <label className="fx-field">
          <span>{field.label}</span>
          <input
            key={inputKey}
            className="num-input"
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            defaultValue={Number(value)}
            onBlur={(e) => {
              const parsed = Number(e.target.value);
              if (!Number.isFinite(parsed)) {
                e.target.value = String(value);
                return;
              }
              commit(Math.max(field.min, Math.min(field.max, parsed)));
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </label>
      );
  }
}

/** Эффекты активного слоя: список с параметрами и добавление нового. */
export function EffectsPanel() {
  const doc = useDocumentStore((s) => s.doc);
  const activeLayerId = useDocumentStore((s) => s.activeLayerId);
  const [kind, setKind] = useState<EffectKind>('fire');
  const layer = findLayer(doc, activeLayerId);
  if (!layer) return null;

  return (
    <section className="panel">
      <header className="panel-header">
        <span>Effects</span>
        <span className="dim">{layer.name}</span>
        <div className="panel-actions">
          <select
            className="select select--small"
            value={kind}
            aria-label="Effect to add"
            onChange={(e) => setKind(e.target.value as EffectKind)}
          >
            {EFFECT_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Add effect to the active layer"
            onClick={() => addEffectAction(kind)}
          >
            <Plus size={14} />
          </button>
        </div>
      </header>
      {layer.effects.length === 0 ? (
        <p className="panel-hint">
          Effects animate the layer without changing its cells. Try Fire.
        </p>
      ) : (
        <ul className="fx-list">
          {layer.effects.map((effect) => (
            <li key={effect.id} className="fx-row">
              <div className="fx-head">
                <label className="fx-field">
                  <input
                    type="checkbox"
                    checked={effect.enabled}
                    onChange={(e) => updateEffectAction(effect, { enabled: e.target.checked })}
                  />
                  <span className="fx-name">{label(effect.kind)}</span>
                </label>
                <button
                  type="button"
                  className="icon-btn icon-btn--small"
                  title="Remove effect"
                  onClick={() => removeEffectAction(effect.id)}
                >
                  <X size={12} />
                </button>
              </div>
              <div className="fx-fields">
                {FIELDS[effect.kind].map((field) => (
                  <FieldEditor key={field.key} effect={effect} field={field} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
