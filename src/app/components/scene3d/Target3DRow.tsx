import { useRef } from 'react';
import { limits3D } from '../../../core/scene3d/scene';
import type { TrackTarget } from '../../../core/tracks';
import { useKeyState } from '../../hooks/useKeyState';
import { toggleKeyAction } from '../../store/keyActions';
import { setScene3DValueAction } from '../../store/scene3dActions';
import { Field, KeyButton, NumberField, resetTo } from '../../ui';

export type Target3D = Extract<TrackTarget, { node: 'body3d' | 'scene3d' }>;

const AXES = ['X', 'Y', 'Z'] as const;

export interface Target3DRowProps {
  readonly target: Target3D;
  readonly label: string;
  /** Одно число или три оси. */
  readonly value: readonly number[];
  readonly step: number;
  readonly suffix?: string;
  readonly title?: string;
  /** Значение по умолчанию для сброса; нет — сброса нет. */
  readonly initial?: readonly number[];
}

/**
 * Анимируемое свойство 3D-сцены: поле на ось и ромб ключа. Поле пишет в документ на каждое
 * движение, записи одного жеста склеиваются; у свойства с ключами правка — ключ в текущий
 * момент, без них — значение во всех кадрах.
 */
export function Target3DRow({
  target,
  label,
  value,
  step,
  suffix,
  title,
  initial,
}: Target3DRowProps) {
  const gesture = useRef(0);
  const state = useKeyState(target);
  const { min, max } = limits3D(target.property);
  const change = (axis: number, next: number): void => {
    if (next === value[axis]) return;
    const values = value.map((v, i) => (i === axis ? next : v));
    const merge = `3d:${target.node}:${target.id}:${target.property}:${gesture.current}`;
    setScene3DValueAction(target, values, merge);
  };
  const reset =
    initial &&
    resetTo(value.join(','), initial.join(','), () => setScene3DValueAction(target, initial));
  return (
    <Field label={label} title={title} onReset={reset || undefined}>
      {value.map((v, axis) => (
        <NumberField
          key={axis}
          label={value.length > 1 ? AXES[axis] : undefined}
          value={v}
          min={min}
          max={max}
          step={step}
          suffix={suffix}
          onChange={(next) => change(axis, next)}
          onCommit={(next) => {
            change(axis, next);
            gesture.current += 1;
          }}
          width={value.length > 1 ? 'var(--field-w-sm)' : 'var(--field-w)'}
        />
      ))}
      <KeyButton
        state={state}
        subject={label.toLowerCase()}
        onClick={() => toggleKeyAction(target)}
      />
    </Field>
  );
}
