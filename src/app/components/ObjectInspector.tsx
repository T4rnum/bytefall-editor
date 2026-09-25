import { parseAttrValue } from '../../core/cell';
import { canEditLayer } from '../../core/document';
import { descendantIds } from '../../core/hierarchy';
import type { SceneObject } from '../../core/object';
import { useDocumentStore } from '../store/documentStore';
import {
  OBJECT_PARENT_SELECT_ID,
  moveSelectedObjectToLayerAction,
  removeObjectPropAction,
  setObjectPropAction,
  setSelectedParentAction,
} from '../store/objectActions';
import { Field, PropertyEditor, Select, plural, valueTypeName } from '../ui';
import { DeformerFields } from './DeformerFields';
import { GlyphFields } from './GlyphFields';
import { LookFields } from './LookFields';
import { MaterialFields } from './MaterialFields';
import { TransformFields } from './TransformFields';

interface Props {
  readonly object: SceneObject;
}

/** Слой, трансформ и произвольные свойства выбранного объекта. */
export function ObjectInspector({ object }: Props) {
  const doc = useDocumentStore((s) => s.doc);
  const layers = doc.layers;
  // Сверху вниз, как в панели слоёв. Запертый или скрытый слой объект не примет.
  const layerOptions = [...layers].reverse().map((layer) => ({
    value: layer.id,
    label: layer.name,
    disabled: layer.id !== object.layerId && !canEditLayer(layer),
  }));

  // Родителем не может стать сам объект и его потомки: цепочка замкнулась бы.
  const descendants = descendantIds(doc, object.id);
  const parentOptions = [
    { value: '', label: 'Нет' },
    ...doc.objects
      .filter((o) => o.id !== object.id)
      .map((o) => ({ value: o.id, label: o.name, disabled: descendants.has(o.id) })),
  ];

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
      <Field label="Родитель">
        <Select
          id={OBJECT_PARENT_SELECT_ID}
          value={object.parentId ?? ''}
          options={parentOptions}
          size="sm"
          ariaLabel="Родитель объекта"
          title="Объект едет и крутится вместе с родителем (Ctrl+P выбрать, Alt+P отвязать)"
          onChange={(id) => setSelectedParentAction(id === '' ? null : id)}
        />
      </Field>
      <TransformFields object={object} />
      <h4 className="inspector-heading">Вид</h4>
      <LookFields object={object} />
      <span className="dim">
        {plural(object.cells.size, { one: 'ячейка', few: 'ячейки', many: 'ячеек' })}
      </span>
      <h4 className="inspector-heading">Материал</h4>
      <MaterialFields object={object} />
      <h4 className="inspector-heading">Деформеры</h4>
      <DeformerFields object={object} />
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
