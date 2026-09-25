import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Deformer, DeformerKind } from '../../core/deformers';
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
} from '../ui';

const KINDS: readonly { readonly value: DeformerKind; readonly label: string }[] = [
  { value: 'wave', label: 'Волна' },
  { value: 'jitter', label: 'Дрожание' },
  { value: 'twist', label: 'Вихрь' },
  { value: 'scaleFalloff', label: 'Размер от центра' },
  { value: 'colorRamp', label: 'Градиент' },
  { value: 'bend', label: 'Изгиб' },
  { value: 'explode', label: 'Разлёт' },
  { value: 'glyphRamp', label: 'Символы по яркости' },
  { value: 'particles', label: 'Частицы' },
];

type Param =
  | {
      readonly key: string;
      readonly label: string;
      readonly type: 'number';
      readonly min: number;
      readonly max: number;
      readonly step: number;
    }
  | { readonly key: string; readonly label: string; readonly type: 'color' }
  | { readonly key: string; readonly label: string; readonly type: 'text' }
  | {
      readonly key: string;
      readonly label: string;
      readonly type: 'select';
      readonly options: readonly { readonly value: string; readonly label: string }[];
    };

const num = (key: string, label: string, min: number, max: number, step: number): Param => ({
  key,
  label,
  type: 'number',
  min,
  max,
  step,
});
const AXIS = { key: 'axis', label: 'Ось', type: 'select' as const };
const period = num('period', 'Период, мс', 10, 600000, 50);

/** Параметры каждого вида: поле знает свои пределы, а файл проверяет те же. */
const PARAMS: { readonly [K in DeformerKind]: readonly Param[] } = {
  wave: [
    {
      ...AXIS,
      options: [
        { value: 'y', label: 'Вверх-вниз' },
        { value: 'x', label: 'Вбок' },
      ],
    },
    num('amplitude', 'Размах', 0, 64, 0.1),
    num('wavelength', 'Длина волны', 0.5, 2048, 0.5),
    period,
  ],
  jitter: [
    num('amplitude', 'Размах', 0, 8, 0.05),
    num('angle', 'Угол, °', 0, 360, 1),
    period,
    num('seed', 'Зерно', 0, 2147483647, 1),
  ],
  twist: [num('strength', 'Сила, °/ячейку', -360, 360, 1)],
  scaleFalloff: [
    num('radius', 'Радиус', 0.5, 2048, 0.5),
    num('inner', 'В центре', 0.1, 32, 0.05),
    num('outer', 'На краю', 0.1, 32, 0.05),
  ],
  colorRamp: [
    { key: 'from', label: 'Цвет от', type: 'color' },
    { key: 'to', label: 'Цвет до', type: 'color' },
    {
      ...AXIS,
      options: [
        { value: 'x', label: 'По X' },
        { value: 'y', label: 'По Y' },
        { value: 'radial', label: 'От центра' },
      ],
    },
    num('length', 'Длина', 0.5, 2048, 0.5),
    num('period', 'Период, мс', 0, 600000, 50),
    num('amount', 'Сила', 0, 1, 0.05),
  ],
  bend: [num('strength', 'Сила, °/ячейку', -90, 90, 1)],
  explode: [
    num('amount', 'Разлёт', 0, 16, 0.05),
    num('angle', 'Вращение, °', 0, 720, 5),
    num('seed', 'Зерно', 0, 2147483647, 1),
  ],
  glyphRamp: [{ key: 'glyphs', label: 'Ряд от тёмного к светлому', type: 'text' }],
  particles: [
    { key: 'glyphs', label: 'Символы по возрасту', type: 'text' },
    { key: 'from', label: 'Цвет в начале', type: 'color' },
    { key: 'to', label: 'Цвет в конце', type: 'color' },
    num('rate', 'В секунду', 0, 200, 1),
    num('life', 'Жизнь, мс', 20, 10000, 50),
    num('speed', 'Скорость', 0, 128, 0.5),
    num('angle', 'Направление, °', -360, 360, 5),
    num('spread', 'Разброс, °', 0, 360, 5),
    num('gravity', 'Тяжесть', -128, 128, 0.5),
    num('seed', 'Зерно', 0, 2147483647, 1),
  ],
};

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
  const value = (deformer as unknown as Readonly<Record<string, string | number>>)[param.key];
  const set = (next: string | number, merge = false): void => {
    if (next === value) return;
    const key = merge ? `deform:${deformer.id}:${param.key}:${gesture.current}` : undefined;
    updateDeformerAction(object.id, deformer.id, { [param.key]: next }, key);
  };
  if (param.type === 'color') {
    return (
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
    );
  }
  if (param.type === 'text') {
    return (
      <Field label={param.label}>
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
      <Field label={param.label}>
        <Select
          value={String(value)}
          options={param.options}
          size="sm"
          ariaLabel={param.label}
          onChange={(v) => set(v)}
        />
      </Field>
    );
  }
  return (
    <Field label={param.label}>
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
  const label = KINDS.find((k) => k.value === deformer.kind)?.label ?? deformer.kind;
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
      {PARAMS[deformer.kind].map((param) => (
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
          options={KINDS}
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
