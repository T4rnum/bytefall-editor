import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Group,
  Lock,
  LockOpen,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { useState } from 'react';
import { findLayer } from '../../core/document';
import { type SceneObject, findObject, objectsInVisualOrder } from '../../core/object';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import {
  deleteSelectedObjectAction,
  duplicateSelectedObjectAction,
  groupSelectionAction,
  moveSelectedObjectOrderAction,
  ungroupSelectedObjectAction,
  updateObjectAction,
} from '../store/objectActions';
import { ObjectInspector } from './ObjectInspector';

interface RowProps {
  readonly object: SceneObject;
  readonly layerName: string;
  readonly active: boolean;
  readonly onActivate: () => void;
}

function ObjectRow({ object, layerName, active, onActivate }: RowProps) {
  const [editing, setEditing] = useState(false);
  const VisibleIcon = object.visible ? Eye : EyeOff;
  const LockIcon = object.locked ? Lock : LockOpen;

  return (
    <li
      className={`layer-row${active ? ' is-active' : ''}${object.visible ? '' : ' is-hidden'}`}
      onClick={onActivate}
    >
      <button
        type="button"
        className="icon-btn icon-btn--small"
        title={object.visible ? 'Hide' : 'Show'}
        onClick={(e) => {
          e.stopPropagation();
          updateObjectAction(object.id, { visible: !object.visible }, 'Toggle object visibility');
        }}
      >
        <VisibleIcon size={14} />
      </button>
      <button
        type="button"
        className={`icon-btn icon-btn--small${object.locked ? ' is-active' : ''}`}
        title={object.locked ? 'Unlock' : 'Lock'}
        onClick={(e) => {
          e.stopPropagation();
          updateObjectAction(object.id, { locked: !object.locked }, 'Toggle object lock');
        }}
      >
        <LockIcon size={14} />
      </button>
      {editing ? (
        <input
          className="layer-name-input"
          autoFocus
          defaultValue={object.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== object.name)
              updateObjectAction(object.id, { name }, 'Rename object');
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="layer-name"
          onDoubleClick={() => setEditing(true)}
          title="Double-click to rename"
        >
          {object.name}
        </span>
      )}
      <span className="dim">{layerName}</span>
    </li>
  );
}

export function ObjectsPanel() {
  const doc = useDocumentStore((s) => s.doc);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedObject = useEditorStore((s) => s.setSelectedObject);
  const hasSelection = useEditorStore((s) => s.selection !== null);
  const objects = objectsInVisualOrder(doc).reverse();
  const selected = selectedId ? findObject(doc, selectedId) : undefined;

  return (
    <section className="panel">
      <header className="panel-header">
        <span>Objects</span>
        <div className="panel-actions">
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Group selection into object (Ctrl+G)"
            disabled={!hasSelection}
            onClick={groupSelectionAction}
          >
            <Group size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Ungroup: bake into layer (Ctrl+Shift+G)"
            disabled={!selected}
            onClick={ungroupSelectedObjectAction}
          >
            <Ungroup size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Duplicate object (Ctrl+D)"
            disabled={!selected}
            onClick={duplicateSelectedObjectAction}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Bring forward"
            disabled={!selected}
            onClick={() => moveSelectedObjectOrderAction(1)}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Send backward"
            disabled={!selected}
            onClick={() => moveSelectedObjectOrderAction(-1)}
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Delete object"
            disabled={!selected}
            onClick={deleteSelectedObjectAction}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>
      {objects.length === 0 ? (
        <p className="panel-hint">Select cells and press Ctrl+G to turn them into an object.</p>
      ) : (
        <ul className="layer-list">
          {objects.map((object) => (
            <ObjectRow
              key={object.id}
              object={object}
              layerName={findLayer(doc, object.layerId)?.name ?? '?'}
              active={object.id === selectedId}
              onActivate={() => setSelectedObject(object.id)}
            />
          ))}
        </ul>
      )}
      {selected && <ObjectInspector key={selected.id} object={selected} />}
    </section>
  );
}
