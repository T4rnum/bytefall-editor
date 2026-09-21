import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { SceneObject } from '../../core/object';
import {
  parsePropValue,
  removeObjectPropAction,
  setObjectPropAction,
  updateObjectAction,
} from '../store/objectActions';

interface Props {
  readonly object: SceneObject;
}

const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
  if (e.key === 'Enter') e.currentTarget.blur();
};

/** Позиция и произвольные свойства выбранного объекта. Поля неконтролируемые, коммит по blur. */
export function ObjectInspector({ object }: Props) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  /** Пустое или нечисловое поле возвращается к текущему значению, а не сбрасывает позицию в 0. */
  const commitPosition = (axis: 'x' | 'y', input: HTMLInputElement): void => {
    const raw = input.value.trim();
    const value = Math.round(Number(raw));
    if (raw === '' || !Number.isFinite(value)) {
      input.value = String(object[axis]);
      return;
    }
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
      <div className="inline-row">
        <span>X</span>
        <input
          key={`${object.id}:x:${object.x}`}
          className="num-input"
          type="number"
          defaultValue={object.x}
          onBlur={(e) => commitPosition('x', e.target)}
          onKeyDown={commitOnEnter}
        />
        <span>Y</span>
        <input
          key={`${object.id}:y:${object.y}`}
          className="num-input"
          type="number"
          defaultValue={object.y}
          onBlur={(e) => commitPosition('y', e.target)}
          onKeyDown={commitOnEnter}
        />
        <span className="dim">{object.cells.size} cells</span>
      </div>

      <div className="props">
        {Object.entries(object.props).map(([key, value]) => (
          <div className="prop-row" key={key}>
            <span className="prop-key" title={typeof value}>
              {key}
            </span>
            <input
              key={`${object.id}:${key}:${String(value)}`}
              className="prop-input"
              defaultValue={String(value)}
              onBlur={(e) => {
                const next = parsePropValue(e.target.value);
                if (next !== value) setObjectPropAction(object.id, key, next);
              }}
              onKeyDown={commitOnEnter}
            />
            <button
              type="button"
              className="icon-btn icon-btn--small"
              title="Remove property"
              onClick={() => removeObjectPropAction(object.id, key)}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <div className="prop-row">
          <input
            className="prop-input"
            placeholder="property"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addProp()}
          />
          <input
            className="prop-input"
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addProp()}
          />
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Add property"
            disabled={!newKey.trim()}
            onClick={addProp}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
