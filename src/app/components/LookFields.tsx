import { useRef } from 'react';
import { parseHex, toHex } from '../../core/color';
import type { SceneObject } from '../../core/object';
import type { TrackTarget } from '../../core/tracks';
import { useKeyState } from '../hooks/useKeyState';
import { toggleKeyAction } from '../store/keyActions';
import { setObjectLookAction } from '../store/lookActions';
import { ColorField, Field, KeyButton, NumberField, resetTo } from '../ui';

/** Цвет оттенка без силы и сила в процентах. Без оттенка — белый, сила ноль. */
function splitTint(tint: string | null): { color: string; strength: number } {
  if (tint === null) return { color: '#ffffff', strength: 0 };
  const c = parseHex(tint);
  return { color: toHex({ ...c, a: 1 }), strength: Math.round(c.a * 100) };
}

/** Оттенок из цвета и силы. Нулевая сила — это отсутствие оттенка. */
function joinTint(color: string, strength: number): string | null {
  return strength <= 0 ? null : toHex({ ...parseHex(color), a: strength / 100 });
}

/** Процентное поле с ромбом ключа: значение видно, тянется мышью и вводится с клавиатуры. */
function KeyedPercent({
  label,
  target,
  subject,
  value,
  onChange,
  onCommit,
  onReset,
}: {
  readonly label: string;
  readonly target: TrackTarget;
  readonly subject: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly onCommit: (value: number) => void;
  readonly onReset?: () => void;
}) {
  const state = useKeyState(target);
  return (
    <Field label={label} onReset={onReset}>
      <NumberField
        value={value}
        min={0}
        max={100}
        step={1}
        suffix="%"
        onChange={onChange}
        onCommit={onCommit}
        width="var(--field-w)"
      />
      <KeyButton state={state} subject={subject} onClick={() => toggleKeyAction(target)} />
    </Field>
  );
}

/**
 * Вид объекта целиком: непрозрачность и оттенок. Оба свойства анимируются: ромб ставит ключ, а
 * правка анимированного свойства сама становится ключом в текущий момент.
 */
export function LookFields({ object }: { readonly object: SceneObject }) {
  const gesture = useRef(0);
  const { color, strength } = splitTint(object.tint);
  const merge = (what: string): string => `look:${object.id}:${what}:${gesture.current}`;
  const end = (): void => {
    gesture.current += 1;
  };

  const setOpacity = (value: number): void => {
    if (value / 100 === object.opacity) return;
    setObjectLookAction(object.id, { opacity: value / 100 }, 'Object opacity', merge('opacity'));
  };
  const setTint = (next: string | null): void => {
    if (next === object.tint) return;
    setObjectLookAction(object.id, { tint: next }, 'Object tint', merge('tint'));
  };
  // Цвет, выбранный при нулевой силе, иначе ничего бы не изменил: сила встаёт в полную.
  const pickColor = (value: string | null): void =>
    setTint(joinTint(value ?? color, strength > 0 ? strength : 100));
  // Сброс — отдельная запись истории: серии жеста он не продолжает.
  const look = (patch: Partial<Pick<SceneObject, 'opacity' | 'tint'>>, label: string): void =>
    setObjectLookAction(object.id, patch, label);

  return (
    <>
      <KeyedPercent
        label="Непрозрачность"
        target={{ node: 'object', id: object.id, property: 'opacity' }}
        subject="непрозрачность"
        value={Math.round(object.opacity * 100)}
        onReset={resetTo(object.opacity, 1, (opacity) => look({ opacity }, 'Object opacity'))}
        onChange={setOpacity}
        onCommit={(v) => {
          setOpacity(v);
          end();
        }}
      />
      <KeyedPercent
        label="Оттенок"
        target={{ node: 'object', id: object.id, property: 'tint' }}
        subject="оттенок"
        value={strength}
        onReset={resetTo(object.tint, null, (tint) => look({ tint }, 'Object tint'))}
        onChange={(v) => setTint(joinTint(color, v))}
        onCommit={(v) => {
          setTint(joinTint(color, v));
          end();
        }}
      />
      <Field
        label="Цвет оттенка"
        onReset={resetTo(color, '#ffffff', (white) =>
          look({ tint: joinTint(white, strength) }, 'Object tint'),
        )}
      >
        <ColorField
          label="Цвет оттенка"
          value={color}
          size="sm"
          onChange={pickColor}
          onCommit={(value) => {
            pickColor(value);
            end();
          }}
        />
        <span className="key-spacer" aria-hidden="true" />
      </Field>
    </>
  );
}
