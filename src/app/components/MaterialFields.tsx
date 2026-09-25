import { useRef } from 'react';
import {
  DEFAULT_DITHER,
  DEFAULT_GLOW,
  DEFAULT_OUTLINE,
  DEFAULT_SHINE,
  type DitherMaterial,
  type GlowMaterial,
  MAX_GLOW_RADIUS,
  MAX_GLOW_STRENGTH,
  MAX_OUTLINE_WIDTH,
  MAX_SHINE_SPEED,
  type OutlineMaterial,
  type ShineMaterial,
} from '../../core/material';
import type { SceneObject } from '../../core/object';
import { setMaterialAction } from '../store/lookActions';
import { Checkbox, ColorField, Field, NumberField, resetTo } from '../ui';

/** Цвет части материала с подписью и сбросом к цвету по умолчанию. */
function PartColor({
  label,
  value,
  initial,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly initial: string;
  readonly onChange: (color: string, merge: boolean) => void;
}) {
  return (
    <Field label={label} onReset={resetTo(value, initial, (c) => onChange(c, false))}>
      <ColorField
        label={label}
        value={value}
        size="sm"
        onChange={(color) => color && onChange(color, true)}
        onCommit={(color) => color && onChange(color, false)}
      />
    </Field>
  );
}

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
          <PartColor
            label="Цвет контура"
            value={value.color}
            initial={DEFAULT_OUTLINE.color}
            onChange={(color, merge) => onChange({ ...value, color }, merge)}
          />
          <PartNumber
            label="Толщина"
            title="В пикселях шрифта"
            value={value.width}
            initial={DEFAULT_OUTLINE.width}
            min={1}
            max={MAX_OUTLINE_WIDTH}
            step={1}
            onChange={(width, merge) => onChange({ ...value, width }, merge)}
          />
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
          <PartColor
            label="Цвет свечения"
            value={value.color}
            initial={DEFAULT_GLOW.color}
            onChange={(color, merge) => onChange({ ...value, color }, merge)}
          />
          <PartNumber
            label="Радиус"
            title="В ячейках"
            value={value.radius}
            initial={DEFAULT_GLOW.radius}
            min={0.05}
            max={MAX_GLOW_RADIUS}
            step={0.05}
            onChange={(radius, merge) => onChange({ ...value, radius }, merge)}
          />
          <PartNumber
            label="Сила"
            value={value.strength}
            initial={DEFAULT_GLOW.strength}
            min={0}
            max={MAX_GLOW_STRENGTH}
            step={0.1}
            onChange={(strength, merge) => onChange({ ...value, strength }, merge)}
          />
        </>
      )}
    </>
  );
}

/**
 * Числовое поле части материала: пишет по ходу жеста и завершает его на отпускании, сбрасывает
 * к значению по умолчанию.
 */
function PartNumber({
  label,
  title,
  value,
  initial,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  readonly label: string;
  readonly title?: string;
  readonly value: number;
  readonly initial: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly suffix?: string;
  readonly onChange: (value: number, merge: boolean) => void;
}) {
  return (
    <Field label={label} title={title} onReset={resetTo(value, initial, (v) => onChange(v, false))}>
      <NumberField
        value={value}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
        onChange={(v) => onChange(v, true)}
        onCommit={(v) => onChange(v, false)}
        width="var(--field-w)"
      />
    </Field>
  );
}

function ShineFields({ value, onChange }: PartProps<ShineMaterial>) {
  const set = (patch: Partial<ShineMaterial>, merge: boolean): void =>
    value ? onChange({ ...value, ...patch }, merge) : undefined;
  return (
    <>
      <Checkbox
        checked={value !== null}
        title="Светлые полосы бегут по символам, как отражение на стекле"
        onChange={(on) => onChange(on ? DEFAULT_SHINE : null, false)}
      >
        Блик
      </Checkbox>
      {value && (
        <>
          <PartColor
            label="Цвет блика"
            value={value.color}
            initial={DEFAULT_SHINE.color}
            onChange={(color, merge) => set({ color }, merge)}
          />
          <PartNumber
            label="Ширина"
            value={value.width}
            initial={DEFAULT_SHINE.width}
            min={0.1}
            max={64}
            step={0.1}
            onChange={(width, m) => set({ width }, m)}
          />
          <PartNumber
            label="Шаг"
            value={value.spacing}
            initial={DEFAULT_SHINE.spacing}
            min={0.5}
            max={256}
            step={0.5}
            onChange={(spacing, m) => set({ spacing }, m)}
          />
          <PartNumber
            label="Скорость"
            value={value.speed}
            initial={DEFAULT_SHINE.speed}
            min={-MAX_SHINE_SPEED}
            max={MAX_SHINE_SPEED}
            step={0.5}
            onChange={(speed, m) => set({ speed }, m)}
          />
          <PartNumber
            label="Угол"
            value={value.angle}
            initial={DEFAULT_SHINE.angle}
            min={-360}
            max={360}
            step={5}
            suffix="°"
            onChange={(angle, m) => set({ angle }, m)}
          />
        </>
      )}
    </>
  );
}

function DitherFields({ value, onChange }: PartProps<DitherMaterial>) {
  return (
    <>
      <Checkbox
        checked={value !== null}
        title="Символы проступают узором по пикселям шрифта, как на старом мониторе"
        onChange={(on) => onChange(on ? DEFAULT_DITHER : null, false)}
      >
        Дизеринг
      </Checkbox>
      {value && (
        <PartNumber
          label="Доля узора"
          value={Math.round(value.amount * 100)}
          initial={Math.round(DEFAULT_DITHER.amount * 100)}
          min={0}
          max={100}
          step={1}
          suffix="%"
          onChange={(v, m) => onChange({ amount: v / 100 }, m)}
        />
      )}
    </>
  );
}

/**
 * GPU-материал объекта: контур, свечение, блик и дизеринг символов. Меняет только то, как
 * символы выглядят, — поэтому он есть на экране и в картинках, но не в тексте.
 */
export function MaterialFields({ object }: { readonly object: SceneObject }) {
  const gesture = useRef(0);
  const change =
    (part: 'outline' | 'glow' | 'shine' | 'dither', label: string) =>
    (
      next: OutlineMaterial | GlowMaterial | ShineMaterial | DitherMaterial | null,
      merge: boolean,
    ): void => {
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
      <ShineFields
        object={object}
        value={object.material?.shine ?? null}
        onChange={change('shine', 'Object shine')}
      />
      <DitherFields
        object={object}
        value={object.material?.dither ?? null}
        onChange={change('dither', 'Object dither')}
      />
    </>
  );
}
