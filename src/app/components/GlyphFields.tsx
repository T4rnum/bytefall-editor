import { useRef } from 'react';
import type { SceneObject } from '../../core/object';
import { effectiveOverride } from '../../core/overrides';
import {
  type GlyphOverride,
  MAX_ROTATION,
  MAX_SCALE,
  MAX_SHIFT,
  MIN_SCALE,
} from '../../core/transform';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { editGlyphsAction, glyphsOf } from '../store/glyphActions';
import { Button, Field, NumberField, plural } from '../ui';

type Key = keyof GlyphOverride;

interface Row {
  readonly label: string;
  readonly axes: readonly { readonly key: Key; readonly label?: string }[];
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly suffix?: string;
}

const ROWS: readonly Row[] = [
  {
    label: 'Поворот',
    axes: [{ key: 'rot' }],
    min: -MAX_ROTATION,
    max: MAX_ROTATION,
    step: 1,
    suffix: '°',
  },
  {
    label: 'Размер',
    axes: [
      { key: 'sx', label: 'X' },
      { key: 'sy', label: 'Y' },
    ],
    min: MIN_SCALE,
    max: MAX_SCALE,
    step: 0.05,
  },
  {
    label: 'Смещение',
    axes: [
      { key: 'dx', label: 'X' },
      { key: 'dy', label: 'Y' },
    ],
    min: -MAX_SHIFT,
    max: MAX_SHIFT,
    step: 0.05,
  },
];

const GLYPHS = { one: 'символ', few: 'символа', many: 'символов' } as const;

/**
 * Поворот, размер и смещение выделенных символов объекта. Символы выделяют рамкой, лассо или
 * палочкой поверх выбранного объекта. Поле показывает значение первого из них, а правка ложится
 * на все сразу. Символ остаётся в своей ячейке: правка меняет только то, как он нарисован.
 */
export function GlyphFields({ object }: { readonly object: SceneObject }) {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const gesture = useRef(0);
  const glyphs = glyphsOf(doc, object.id, selection);

  if (!glyphs) {
    return (
      <span className="dim">
        Чтобы повернуть отдельные символы, выдели их рамкой, лассо или палочкой.
      </span>
    );
  }
  const first = effectiveOverride(object.overrides, glyphs.keys[0]);
  const change = (key: Key, value: number): void => {
    const mergeKey = `glyphs:${object.id}:${key}:${gesture.current}`;
    editGlyphsAction(glyphs, (c) => ({ ...c, [key]: value }), 'Edit glyphs', mergeKey);
  };
  const edited = glyphs.keys.some((key) => object.overrides.has(key));

  return (
    <>
      <span className="dim">Выделено {plural(glyphs.keys.length, GLYPHS)}</span>
      {ROWS.map((row) => (
        <Field key={row.label} label={row.label}>
          {row.axes.map(({ key, label }) => (
            <NumberField
              key={key}
              label={label}
              value={first[key]}
              min={row.min}
              max={row.max}
              step={row.step}
              suffix={row.suffix}
              onChange={(value) => change(key, value)}
              onCommit={(value) => {
                change(key, value);
                gesture.current += 1;
              }}
              width={row.axes.length === 1 ? 'var(--field-w)' : 'var(--field-w-sm)'}
            />
          ))}
        </Field>
      ))}
      <Button
        size="sm"
        disabled={!edited}
        label="Вернуть выделенным символам обычный вид"
        onClick={() => editGlyphsAction(glyphs, () => ({}), 'Reset glyphs')}
      >
        Снять правку символов
      </Button>
    </>
  );
}
