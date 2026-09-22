import { parseAttrValue } from '../../core/cell';
import { MAX_DIMENSION, canEditLayer } from '../../core/document';
import type { SceneObject } from '../../core/object';
import { useDocumentStore } from '../store/documentStore';
import {
  moveSelectedObjectToLayerAction,
  removeObjectPropAction,
  setObjectPropAction,
  updateObjectAction,
} from '../store/objectActions';
import { Field, NumberField, PropertyEditor, Select, plural, valueTypeName } from '../ui';

interface Props {
  readonly object: SceneObject;
}

/** Позиция и произвольные свойства выбранного объекта. */
export function ObjectInspector({ object }: Props) {
  const layers = useDocumentStore((s) => s.doc.layers);
  // Сверху вниз, как в панели слоёв. Запертый или скрытый слой объект не примет.
  const layerOptions = [...layers].reverse().map((layer) => ({
    value: layer.id,
    label: layer.name,
    disabled: layer.id !== object.layerId && !canEditLayer(layer),
  }));
  const move = (axis: 'x' | 'y', value: number): void => {
    if (value !== object[axis]) updateObjectAction(object.id, { [axis]: value }, 'Move object');
  };

  const rows = Object.entries(object.props).map(([key, value]) => ({
    key,
    value: String(value),
    hint: valueTypeName(value),
  }));

  const change = (key: string, text: string): void => {
    const next = parseAttrValue(text);
    if (next !== object.props[key]) setObjectPropAction(object.id, key, next);
  };

  return (
    <div className="inspector">
      <Field label="Слой">
        <Select
          value={object.layerId}
          options={layerOptions}
          size="sm"
          ariaLabel="Слой объекта"
          title="Перенести объект на другой слой (Alt+] выше, Alt+[ ниже)"
          onChange={moveSelectedObjectToLayerAction}
        />
      </Field>
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

      <PropertyEditor
        rows={rows}
        onChange={change}
        onRemove={(key) => removeObjectPropAction(object.id, key)}
        onAdd={(key, text) => setObjectPropAction(object.id, key, parseAttrValue(text))}
      />
    </div>
  );
}
