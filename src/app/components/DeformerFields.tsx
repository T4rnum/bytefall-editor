import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { type Deformer, type DeformerKind, createDeformer } from '../../core/deformers';
import type { SceneObject } from '../../core/object';
import { DEFORMER_PARAMS, type DeformerParam } from '../../core/tracks';
import { useKeyState } from '../hooks/useKeyState';
import { toggleKeyAction } from '../store/keyActions';
import {
  addDeformerAction,
  moveDeformerAction,
  removeDeformerAction,
  updateDeformerAction,
} from '../store/deformerActions';
import {
  Button,
  Checkbox,
  ColorField,
  Field,
  KeyButton,
  NumberField,
  Select,
  TextField,
  resetTo,
} from '../ui';
import { DEFORMER_FIELDS, DEFORMER_KIND_OPTIONS, type Param } from './deformerParams';

type Values = Readonly<Record<string, string | number>>;

/** Параметры нового деформера того же вида: к ним ведут кнопки сброса. */
const defaultsOf = (kind: DeformerKind): Values => createDeformer(kind, '') as unknown as Values;

/** Цвета сравниваются без регистра: #FFEC27 и #ffec27 — один цвет. */
const comparable = (param: Param, value: string | number): string | number =>
  param.type === 'color' ? String(value).toLowerCase() : value;

function ParamField({
  object,
  deformer,
  param,
}: {
  object: SceneObject;
  deformer: Deformer;
  param: Param;
}) {
  const gesture = useRef(0);
  const value = (deformer as unknown as Values)[param.key];
  const set = (next: string | number, merge = false): void => {
    if (next === value) return;
    const key = merge ? `deform:${deformer.id}:${param.key}:${gesture.current}` : undefined;
    updateDeformerAction(object.id, deformer.id, { [param.key]: next }, key);
  };
  // Сброс — отдельная запись истории: серии жеста он не продолжает.
  const initial = defaultsOf(deformer.kind)[param.key];
  const reset = resetTo(comparable(param, value), comparable(param, initial), () =>
    updateDeformerAction(object.id, deformer.id, { [param.key]: initial }),
  );
  if (param.type === 'color') {
    return (
      <Field label={param.label} onReset={reset}>
        <ColorField
          label={param.label}
          value={String(value)}
          size="sm"
          onChange={(c) => c && set(c, true)}
          onCommit={(c) => {
            if (c) set(c, true);
            gesture.current += 1;
          }}
        />
        <span className="key-spacer" aria-hidden="true" />
      </Field>
    );
  }
  if (param.type === 'text') {
    return (
      <Field label={param.label} stacked onReset={reset}>
        <TextField
          value={String(value)}
          size="sm"
          pixel
          ariaLabel={param.label}
          onCommit={(text) => text.length > 0 && set(text)}
        />
      </Field>
    );
  }
  if (param.type === 'select') {
    return (
      <Field label={param.label} onReset={reset}>
        <Select
          value={String(value)}
          options={param.options}
          size="sm"
          ariaLabel={param.label}
          onChange={(v) => set(v)}
        />
        <span className="key-spacer" aria-hidden="true" />
      </Field>
    );
  }
  return (
    <Field label={param.label} onReset={reset}>
      <NumberField
        value={Number(value)}
        min={param.min}
        max={param.max}
        step={param.step}
        onChange={(v) => set(v, true)}
        onCommit={(v) => {
          set(v, true);
          gesture.current += 1;
        }}
        width="var(--field-w)"
      />
      <ParamKey deformer={deformer} param={param} />
    </Field>
  );
}

/** Ромб ключа у числового параметра; у зерна и частоты частиц ключей нет — там пустое место. */
function ParamKey({ deformer, param }: { deformer: Deformer; param: Param }) {
  const animatable = (DEFORMER_PARAMS as readonly string[]).includes(param.key);
  const target = animatable
    ? { node: 'deformer' as const, id: deformer.id, property: param.key as DeformerParam }
    : null;
  const state = useKeyState(target);
  if (!target) return <span className="key-spacer" aria-hidden="true" />;
  return (
    <KeyButton
      state={state}
      subject={param.label.toLowerCase()}
      onClick={() => toggleKeyAction(target)}
    />
  );
}

function DeformerItem({
  object,
  deformer,
  index,
}: {
  object: SceneObject;
  deformer: Deformer;
  index: number;
}) {
  const label =
    DEFORMER_KIND_OPTIONS.find((k) => k.value === deformer.kind)?.label ?? deformer.kind;
  return (
    <li className="fx-row">
      <div className="fx-head">
        <Checkbox
          checked={deformer.enabled}
          onChange={(enabled) => updateDeformerAction(object.id, deformer.id, { enabled })}
        >
          {label}
        </Checkbox>
        <Button
          icon
          size="sm"
          label="Раньше по стеку"
          disabled={index === 0}
          onClick={() => moveDeformerAction(object.id, deformer.id, -1)}
        >
          <ChevronUp size={14} />
        </Button>
        <Button
          icon
          size="sm"
          label="Позже по стеку"
          disabled={index === object.deformers.length - 1}
          onClick={() => moveDeformerAction(object.id, deformer.id, 1)}
        >
          <ChevronDown size={14} />
        </Button>
        <Button
          icon
          size="sm"
          variant="danger"
          label="Убрать деформер"
          onClick={() => removeDeformerAction(object.id, deformer.id)}
        >
          <X size={14} />
        </Button>
      </div>
      {DEFORMER_FIELDS[deformer.kind].map((param) => (
        <ParamField key={param.key} object={object} deformer={deformer} param={param} />
      ))}
    </li>
  );
}

/**
 * Стек деформеров объекта: сверху вниз по порядку применения. Деформер двигает и красит символы
 * во времени без ключей на каждый символ: волна, дрожание, вихрь, размер, градиент, частицы.
 */
export function DeformerFields({ object }: { readonly object: SceneObject }) {
  const [kind, setKind] = useState<DeformerKind>('wave');
  return (
    <>
      <div className="keyed">
        <Select
          value={kind}
          options={DEFORMER_KIND_OPTIONS}
          size="sm"
          ariaLabel="Какой деформер добавить"
          onChange={setKind}
        />
        <Button
          icon
          size="sm"
          label="Добавить деформер объекту"
          onClick={() => addDeformerAction(object.id, kind)}
        >
          <Plus size={14} />
        </Button>
      </div>
      {object.deformers.length > 0 && (
        <ul className="fx-list">
          {object.deformers.map((deformer, i) => (
            <DeformerItem key={deformer.id} object={object} deformer={deformer} index={i} />
          ))}
        </ul>
      )}
    </>
  );
}
