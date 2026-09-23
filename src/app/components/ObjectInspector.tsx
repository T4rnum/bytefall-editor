import { parseAttrValue } from '../../core/cell';
import { canEditLayer } from '../../core/document';
import type { SceneObject } from '../../core/object';
import { useDocumentStore } from '../store/documentStore';
import {
  moveSelectedObjectToLayerAction,
  removeObjectPropAction,
  setObjectPropAction,
} from '../store/objectActions';
import { Field, PropertyEditor, Select, plural, valueTypeName } from '../ui';
import { GlyphFields } from './GlyphFields';
import { TransformFields } from './TransformFields';

interface Props {
  readonly object: SceneObject;
}

/** Слой, трансформ и произвольные свойства выбранного объекта. */
export function ObjectInspector({ object }: Props) {
  const layers = useDocumentStore((s) => s.doc.layers);
  // Сверху вниз, как в панели слоёв. Запертый или скрытый слой объект не примет.
  const layerOptions = [...layers].reverse().map((layer) => ({
    value: layer.id,
    label: layer.name,
    disabled: layer.id !== object.layerId && !canEditLayer(layer),
  }));

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
      <TransformFields object={object} />
      <span className="dim">
        {plural(object.cells.size, { one: 'ячейка', few: 'ячейки', many: 'ячеек' })}
      </span>
      <h4 className="inspector-heading">Отдельные символы</h4>
      <GlyphFields object={object} />

      <PropertyEditor
        rows={rows}
        onChange={change}
        onRemove={(key) => removeObjectPropAction(object.id, key)}
        onAdd={(key, text) => setObjectPropAction(object.id, key, parseAttrValue(text))}
      />
    </div>
  );
}
