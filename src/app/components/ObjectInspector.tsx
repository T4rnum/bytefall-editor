import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { MAX_DIMENSION } from '../../core/document';
import type { SceneObject } from '../../core/object';
import {
  parsePropValue,
  removeObjectPropAction,
  setObjectPropAction,
  updateObjectAction,
} from '../store/objectActions';
import { Button, Field, NumberField, TextField, plural } from '../ui';

/** Подсказка к имени свойства: какого оно типа. */
const TYPE_NAMES: Readonly<Record<string, string>> = {
  string: 'строка',
  number: 'число',
  boolean: 'да или нет',
};

interface Props {
  readonly object: SceneObject;
}

/** Позиция и произвольные свойства выбранного объекта. */
export function ObjectInspector({ object }: Props) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const move = (axis: 'x' | 'y', value: number): void => {
    if (value !== object[axis]) updateObjectAction(object.id, { [axis]: value }, 'Move object');
  };

  const addProp = (): void => {
    if (!newKey.trim()) return;
    setObjectPropAction(object.id, newKey, parsePropValue(newValue));
    setNewKey('');
    setNewValue('');
  };

  return (
    <div className="inspector">
      <Field label="Положение">
        <NumberField
          label="X"
          value={object.x}
          min={-MAX_DIMENSION}
          max={MAX_DIMENSION}
          onChange={(value) => move('x', value)}
          width="var(--field-w-sm)"
        />
        <NumberField
          label="Y"
          value={object.y}
          min={-MAX_DIMENSION}
          max={MAX_DIMENSION}
          onChange={(value) => move('y', value)}
          width="var(--field-w-sm)"
        />
      </Field>
      <span className="dim">
        {plural(object.cells.size, { one: 'ячейка', few: 'ячейки', many: 'ячеек' })}
      </span>

      <div className="props">
        {Object.entries(object.props).map(([key, value]) => (
          <div className="prop-row" key={key}>
            <span className="prop-key" title={TYPE_NAMES[typeof value]}>
              {key}
            </span>
            <TextField
              value={String(value)}
              size="sm"
              ariaLabel={`Значение ${key}`}
              onCommit={(text) => {
                const next = parsePropValue(text);
                if (next !== value) setObjectPropAction(object.id, key, next);
              }}
            />
            <Button
              icon
              size="sm"
              variant="danger"
              label="Удалить свойство"
              onClick={() => removeObjectPropAction(object.id, key)}
            >
              <X size={12} />
            </Button>
          </div>
        ))}
        <div className="prop-row">
          <input
            className="textfield textfield--sm prop-key-input"
            placeholder="свойство"
            aria-label="Имя нового свойства"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') addProp();
            }}
          />
          <input
            className="textfield textfield--sm"
            placeholder="значение"
            aria-label="Значение нового свойства"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') addProp();
            }}
          />
          <Button
            icon
            size="sm"
            label="Добавить свойство"
            disabled={!newKey.trim()}
            onClick={addProp}
          >
            <Plus size={12} />
          </Button>
        </div>
      </div>
    </div>
  );
}
