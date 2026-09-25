import { useRef } from 'react';
import {
  DEFAULT_GLOW,
  DEFAULT_OUTLINE,
  type GlowMaterial,
  MAX_GLOW_RADIUS,
  MAX_GLOW_STRENGTH,
  MAX_OUTLINE_WIDTH,
  type OutlineMaterial,
} from '../../core/material';
import type { SceneObject } from '../../core/object';
import { setMaterialAction } from '../store/lookActions';
import { Checkbox, ColorField, Field, NumberField } from '../ui';

interface PartProps<T> {
  readonly object: SceneObject;
  readonly value: T | null;
  /** Правка части: `merge` — запись жеста, который ещё идёт. */
  readonly onChange: (next: T | null, merge: boolean) => void;
}

function OutlineFields({ value, onChange }: PartProps<OutlineMaterial>) {
  return (
    <>
      <Checkbox
        checked={value !== null}
        title="Контур вокруг формы символов: в PNG и GIF он есть, в тексте — нет"
        onChange={(on) => onChange(on ? DEFAULT_OUTLINE : null, false)}
      >
        Контур
      </Checkbox>
      {value && (
        <>
          <ColorField
            label="Цвет контура"
            value={value.color}
            size="sm"
            onChange={(color) => color && onChange({ ...value, color }, true)}
            onCommit={(color) => color && onChange({ ...value, color }, false)}
          />
          <Field label="Толщина" title="В пикселях шрифта">
            <NumberField
              value={value.width}
              min={1}
              max={MAX_OUTLINE_WIDTH}
              step={1}
              onChange={(width) => onChange({ ...value, width }, true)}
              onCommit={(width) => onChange({ ...value, width }, false)}
              width="var(--field-w)"
            />
          </Field>
        </>
      )}
    </>
  );
}

function GlowFields({ value, onChange }: PartProps<GlowMaterial>) {
  return (
    <>
      <Checkbox
        checked={value !== null}
        title="Мягкое свечение вокруг символов: в PNG и GIF оно есть, в тексте — нет"
        onChange={(on) => onChange(on ? DEFAULT_GLOW : null, false)}
      >
        Свечение
      </Checkbox>
      {value && (
        <>
          <ColorField
            label="Цвет свечения"
            value={value.color}
            size="sm"
            onChange={(color) => color && onChange({ ...value, color }, true)}
            onCommit={(color) => color && onChange({ ...value, color }, false)}
          />
          <Field label="Радиус" title="В ячейках">
            <NumberField
              value={value.radius}
              min={0.05}
              max={MAX_GLOW_RADIUS}
              step={0.05}
              onChange={(radius) => onChange({ ...value, radius }, true)}
              onCommit={(radius) => onChange({ ...value, radius }, false)}
              width="var(--field-w)"
            />
          </Field>
          <Field label="Сила">
            <NumberField
              value={value.strength}
              min={0}
              max={MAX_GLOW_STRENGTH}
              step={0.1}
              onChange={(strength) => onChange({ ...value, strength }, true)}
              onCommit={(strength) => onChange({ ...value, strength }, false)}
              width="var(--field-w)"
            />
          </Field>
        </>
      )}
    </>
  );
}

/**
 * GPU-материал объекта: контур и свечение символов. Меняет только то, как символы выглядят, —
 * поэтому они есть на экране и в картинках, но не в тексте.
 */
export function MaterialFields({ object }: { readonly object: SceneObject }) {
  const gesture = useRef(0);
  const change =
    (part: 'outline' | 'glow', label: string) =>
    (next: OutlineMaterial | GlowMaterial | null, merge: boolean): void => {
      const key = `material:${object.id}:${part}:${gesture.current}`;
      setMaterialAction(object.id, { [part]: next }, label, key);
      if (!merge) gesture.current += 1;
    };
  return (
    <>
      <OutlineFields
        object={object}
        value={object.material?.outline ?? null}
        onChange={change('outline', 'Object outline')}
      />
      <GlowFields
        object={object}
        value={object.material?.glow ?? null}
        onChange={change('glow', 'Object glow')}
      />
    </>
  );
}
