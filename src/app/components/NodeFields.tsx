import { useRef } from 'react';
import type { GraphNode, InputSpec, OptionSpec } from '../../core/graph/types';
import type { SceneObject } from '../../core/object';
import type { SkinBone } from '../../core/skin';
import { useKeyState } from '../hooks/useKeyState';
import { rebindBonesAction, setNodeInputAction, setNodeOptionAction } from '../store/graphActions';
import { toggleKeyAction } from '../store/keyActions';
import {
  Button,
  ColorField,
  Field,
  KeyButton,
  NumberField,
  Select,
  TextField,
  plural,
  resetTo,
} from '../ui';

/**
 * Поля узла в инспекторе: число на незанятом входе — с ключом анимации и сбросом, настройка —
 * по своему типу. Настройки ключами не ведутся: они меняют устройство узла, а не число.
 */

/** Шаг поля по пределам входа: у целого — единица, у узкого диапазона — сотые. */
function stepOf(input: InputSpec): number {
  if (input.integer) return 1;
  const span = (input.max ?? 100) - (input.min ?? 0);
  return span <= 2 ? 0.05 : span <= 20 ? 0.1 : 1;
}

export function InputField({ node, input }: { node: GraphNode; input: InputSpec }) {
  const gesture = useRef(0);
  const target = { node: 'node' as const, id: node.id, property: input.name };
  const state = useKeyState(target);
  const value = node.values[input.name] ?? input.default ?? 0;
  const set = (next: number): void =>
    setNodeInputAction(
      node.id,
      input.name,
      next,
      `node:${node.id}:${input.name}:${gesture.current}`,
    );
  // Сброс — отдельная запись истории: серии жеста он не продолжает.
  const reset = resetTo(value, input.default ?? 0, () =>
    setNodeInputAction(node.id, input.name, input.default ?? 0),
  );
  return (
    <Field label={input.label} onReset={reset}>
      <NumberField
        value={value}
        min={input.min}
        max={input.max}
        step={stepOf(input)}
        onChange={set}
        onCommit={(v) => {
          set(v);
          gesture.current += 1;
        }}
        width="var(--field-w)"
      />
      <KeyButton
        state={state}
        subject={input.label.toLowerCase()}
        onClick={() => toggleKeyAction(target)}
      />
    </Field>
  );
}

export function OptionField({
  object,
  node,
  option,
}: {
  object: SceneObject;
  node: GraphNode;
  option: OptionSpec;
}) {
  const gesture = useRef(0);
  const set = (value: string | number, merge = false): void =>
    setNodeOptionAction(
      object.id,
      node.id,
      option.name,
      value,
      merge ? `option:${node.id}:${option.name}:${gesture.current}` : undefined,
    );
  if (option.type === 'bones') {
    const bones = (node.options.bones as readonly SkinBone[] | undefined) ?? [];
    return (
      <Field label={plural(bones.length, { one: 'кость', few: 'кости', many: 'костей' })}>
        <Button
          size="sm"
          label="Запомнить кости такими, как сейчас: от этой позы символы и отсчитывают сгиб"
          onClick={() => rebindBonesAction(object.id, node.id)}
        >
          Поза покоя — сейчас
        </Button>
      </Field>
    );
  }
  const own = node.options[option.name];
  const value = typeof own === 'string' || typeof own === 'number' ? own : option.default;
  // Сброс — отдельная запись истории: серии жеста он не продолжает.
  const reset = resetTo(String(value).toLowerCase(), String(option.default).toLowerCase(), () =>
    setNodeOptionAction(object.id, node.id, option.name, option.default),
  );
  switch (option.type) {
    case 'enum':
      return (
        <Field label={option.label} onReset={reset}>
          <Select
            value={String(value)}
            options={option.values}
            size="sm"
            ariaLabel={option.label}
            onChange={(v) => set(v)}
          />
          <span className="key-spacer" aria-hidden="true" />
        </Field>
      );
    case 'text':
      return (
        <Field label={option.label} stacked onReset={reset}>
          <TextField
            value={String(value)}
            size="sm"
            pixel
            ariaLabel={option.label}
            onCommit={(text) => text.length > 0 && set(text.slice(0, option.maxLength))}
          />
        </Field>
      );
    case 'color':
      return (
        <Field label={option.label} onReset={reset}>
          <ColorField
            label={option.label}
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
    case 'number':
      return (
        <Field label={option.label} onReset={reset}>
          <NumberField
            value={Number(value)}
            min={option.min}
            max={option.max}
            step={option.integer ? 1 : 0.1}
            onChange={(v) => set(v, true)}
            onCommit={(v) => {
              set(v, true);
              gesture.current += 1;
            }}
            width="var(--field-w)"
          />
          <span className="key-spacer" aria-hidden="true" />
        </Field>
      );
  }
}
