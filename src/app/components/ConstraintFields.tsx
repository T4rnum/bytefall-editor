import { Crosshair, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  type Constraint,
  type ConstraintKind,
  MAX_CHAIN,
  MAX_DELAY,
  createConstraint,
} from '../../core/constraints';
import type { SceneObject } from '../../core/object';
import { isBone } from '../../core/rig';
import {
  addConstraintAction,
  addIkControlAction,
  removeConstraintAction,
  updateConstraintAction,
} from '../store/constraintActions';
import { useDocumentStore } from '../store/documentStore';
import { Button, Checkbox, Field, NumberField, Select, type SelectOption, resetTo } from '../ui';

const LABELS: Readonly<Record<ConstraintKind, string>> = {
  follow: 'Задержка',
  aim: 'Слежение',
  ik: 'IK',
};

const TITLES: Readonly<Record<ConstraintKind, string>> = {
  follow: 'Родитель ведёт объект таким, каким был чуть раньше: хвост, хлыст, верёвка',
  aim: 'Объект поворачивается осью X к цели, с запаздыванием — туда, где цель была',
  ik: 'Цепочка костей тянется концом к цели, суставы держат пределы',
};

interface ItemProps {
  readonly object: SceneObject;
  readonly link: Constraint;
  readonly targets: readonly SelectOption<string>[];
}

type NumberKey = 'delay' | 'lag' | 'chain';

/**
 * Число связи: пишет по ходу жеста одной записью истории, сбрасывается к значению новой связи.
 * Сброс — отдельная запись, серию жеста он не продолжает.
 */
function LinkNumber({
  object,
  link,
  field,
  label,
  max,
  step,
}: {
  readonly object: SceneObject;
  readonly link: Constraint;
  readonly field: NumberKey;
  readonly label: string;
  readonly max: number;
  readonly step: number;
}) {
  const gesture = useRef(0);
  const value = (link as unknown as Record<NumberKey, number>)[field];
  const initial = (createConstraint(link.kind, link.id) as unknown as Record<NumberKey, number>)[
    field
  ];
  const write = (v: number): void =>
    updateConstraintAction(
      object.id,
      link.id,
      { [field]: v },
      `link:${link.id}:${gesture.current}`,
    );
  return (
    <Field
      label={label}
      onReset={resetTo(value, initial, (v) =>
        updateConstraintAction(object.id, link.id, { [field]: v }),
      )}
    >
      <NumberField
        value={value}
        min={field === 'chain' ? 1 : 0}
        max={max}
        step={step}
        onChange={write}
        onCommit={(v) => {
          write(v);
          gesture.current += 1;
        }}
        width="var(--field-w)"
      />
    </Field>
  );
}

/** Одна связь: включатель, удаление и параметры её вида. */
function LinkItem({ object, link, targets }: ItemProps) {
  const set = (patch: Record<string, unknown>): void =>
    updateConstraintAction(object.id, link.id, patch);
  const number = (field: NumberKey, label: string, max: number, step: number) => (
    <LinkNumber object={object} link={link} field={field} label={label} max={max} step={step} />
  );
  const target =
    link.kind === 'follow' ? null : (
      <Field label="Цель">
        <Select
          value={link.target ?? ''}
          options={targets}
          size="sm"
          ariaLabel="Цель связи"
          onChange={(id) => set({ target: id === '' ? null : id })}
        />
      </Field>
    );
  return (
    <li className="fx-row">
      <div className="fx-head" title={TITLES[link.kind]}>
        <Checkbox
          checked={link.enabled}
          onChange={(enabled) => updateConstraintAction(object.id, link.id, { enabled })}
        >
          {LABELS[link.kind]}
        </Checkbox>
        <Button
          icon
          size="sm"
          variant="danger"
          label="Убрать связь"
          onClick={() => removeConstraintAction(object.id, link.id)}
        >
          <X size={14} />
        </Button>
      </div>
      {target}
      {link.kind === 'follow' && number('delay', 'Задержка, мс', MAX_DELAY, 10)}
      {link.kind === 'aim' && number('lag', 'Запаздывание, мс', MAX_DELAY, 10)}
      {link.kind === 'ik' && number('chain', 'Костей в цепочке', MAX_CHAIN, 1)}
    </li>
  );
}

/**
 * Связи объекта: задержка за родителем, слежение за целью, у кости — IK. Связь не меняет
 * трансформ объекта, а меняет, где он оказывается, поэтому поля трансформа остаются своими.
 */
export function ConstraintFields({ object }: { readonly object: SceneObject }) {
  const objects = useDocumentStore((s) => s.doc.objects);
  const bone = isBone(object);
  const kinds: SelectOption<ConstraintKind>[] = (['follow', 'aim', 'ik'] as const)
    .filter((k) => k !== 'ik' || bone)
    .map((k) => ({ value: k, label: LABELS[k] }));
  const [chosen, setKind] = useState<ConstraintKind>(bone ? 'ik' : 'follow');
  const kind = kinds.some((k) => k.value === chosen) ? chosen : kinds[0].value;
  // Контроллеры первыми: IK обычно тянется к ним.
  const others = objects.filter((o) => o.id !== object.id);
  const ordered = [
    ...others.filter((o) => o.rig?.kind === 'control'),
    ...others.filter((o) => o.rig?.kind !== 'control'),
  ];
  const targetsFor = (link: Constraint): SelectOption<string>[] => [
    { value: '', label: link.kind === 'aim' ? 'Родитель' : 'Нет' },
    ...ordered.map((o) => ({ value: o.id, label: o.name })),
  ];
  return (
    <>
      <div className="keyed">
        <Select
          value={kind}
          options={kinds}
          size="sm"
          ariaLabel="Какую связь добавить"
          onChange={setKind}
        />
        <Button
          icon
          size="sm"
          label="Добавить связь объекту"
          onClick={() => addConstraintAction(object.id, kind)}
        >
          <Plus size={14} />
        </Button>
        {bone && (
          <Button
            icon
            size="sm"
            label="IK к новому контроллеру на конце кости (Shift+I)"
            onClick={addIkControlAction}
          >
            <Crosshair size={14} />
          </Button>
        )}
      </div>
      {object.constraints.length > 0 && (
        <ul className="fx-list">
          {object.constraints.map((link) => (
            <LinkItem key={link.id} object={object} link={link} targets={targetsFor(link)} />
          ))}
        </ul>
      )}
    </>
  );
}
