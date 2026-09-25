import { useRef } from 'react';
import type { SceneObject } from '../../core/object';
import {
  type AngleLimit,
  MAX_BONE_LENGTH,
  MAX_LIMIT,
  MIN_BONE_LENGTH,
  isBone,
} from '../../core/rig';
import { setBoneLengthAction, setBoneLimitAction } from '../store/rigActions';
import { Checkbox, Field, NumberField } from '../ui';

/** Пределы по умолчанию: сустав гнётся на четверть оборота в обе стороны. */
const DEFAULT_LIMIT: AngleLimit = { min: -90, max: 90 };

/**
 * Кость рига: длина и пределы угла, которые держит IK. Контроллеру настраивать нечего: это
 * точка, её двигают трансформом.
 */
export function RigFields({ object }: { readonly object: SceneObject }) {
  const gesture = useRef(0);
  if (!isBone(object)) {
    return <p className="panel-hint">Контроллер: за него тянут цепочку IK и двигают риг.</p>;
  }
  const { length, limit } = object.rig;
  const merge = (what: string): string => `rig:${object.id}:${what}:${gesture.current}`;
  const end = (): void => {
    gesture.current += 1;
  };
  const setLimit = (patch: Partial<AngleLimit>, what: string): void =>
    limit ? setBoneLimitAction(object.id, { ...limit, ...patch }, merge(what)) : undefined;
  return (
    <>
      <Field label="Длина" title="В ячейках. Кости на конце едут вместе с ним">
        <NumberField
          value={length}
          min={MIN_BONE_LENGTH}
          max={MAX_BONE_LENGTH}
          step={0.25}
          onChange={(v) => setBoneLengthAction(object.id, v, merge('length'))}
          onCommit={(v) => {
            setBoneLengthAction(object.id, v, merge('length'));
            end();
          }}
          width="var(--field-w)"
        />
      </Field>
      <Checkbox
        checked={limit !== null}
        title="Насколько сустав гнётся относительно родителя: IK не выведет его за пределы"
        onChange={(on) => setBoneLimitAction(object.id, on ? DEFAULT_LIMIT : null)}
      >
        Пределы угла
      </Checkbox>
      {limit && (
        <>
          <Field label="От, °">
            <NumberField
              value={limit.min}
              min={-MAX_LIMIT}
              max={MAX_LIMIT}
              step={5}
              onChange={(min) => setLimit({ min }, 'min')}
              onCommit={(min) => {
                setLimit({ min }, 'min');
                end();
              }}
              width="var(--field-w)"
            />
          </Field>
          <Field label="До, °">
            <NumberField
              value={limit.max}
              min={-MAX_LIMIT}
              max={MAX_LIMIT}
              step={5}
              onChange={(max) => setLimit({ max }, 'max')}
              onCommit={(max) => {
                setLimit({ max }, 'max');
                end();
              }}
              width="var(--field-w)"
            />
          </Field>
        </>
      )}
    </>
  );
}
