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
import { Button, Panel, TextField } from '../ui';
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
      className={`item-row${active ? ' is-active' : ''}${object.visible ? '' : ' is-hidden'}`}
      onClick={onActivate}
    >
      <Button
        icon
        size="sm"
        label={object.visible ? 'Hide object' : 'Show object'}
        onClick={(e) => {
          e.stopPropagation();
          updateObjectAction(object.id, { visible: !object.visible }, 'Toggle object visibility');
        }}
      >
        <VisibleIcon size={14} />
      </Button>
      <Button
        icon
        size="sm"
        active={object.locked}
        label={object.locked ? 'Unlock object' : 'Lock object'}
        onClick={(e) => {
          e.stopPropagation();
          updateObjectAction(object.id, { locked: !object.locked }, 'Toggle object lock');
        }}
      >
        <LockIcon size={14} />
      </Button>
      {editing ? (
        <div className="item-name" onClick={(e) => e.stopPropagation()}>
          <TextField
            value={object.name}
            size="sm"
            className="item-name-input"
            ariaLabel="Object name"
            onCommit={(text) => {
              const name = text.trim();
              if (name && name !== object.name) {
                updateObjectAction(object.id, { name }, 'Rename object');
              }
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <span
          className="item-name"
          onDoubleClick={() => setEditing(true)}
          title="Двойной щелчок — переименовать"
        >
          {object.name}
        </span>
      )}
      <span className="item-meta">{layerName}</span>
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
    <Panel
      id="objects"
      title="Objects"
      badge={objects.length > 0 ? `${objects.length}` : undefined}
      actions={
        <>
          <Button
            icon
            size="sm"
            label="Group selection into object"
            hotkey="Ctrl+G"
            disabled={!hasSelection}
            onClick={groupSelectionAction}
          >
            <Group size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Ungroup: bake into layer"
            hotkey="Ctrl+Shift+G"
            disabled={!selected}
            onClick={ungroupSelectedObjectAction}
          >
            <Ungroup size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Duplicate object"
            hotkey="Ctrl+D"
            disabled={!selected}
            onClick={duplicateSelectedObjectAction}
          >
            <Copy size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Bring forward"
            disabled={!selected}
            onClick={() => moveSelectedObjectOrderAction(1)}
          >
            <ChevronUp size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Send backward"
            disabled={!selected}
            onClick={() => moveSelectedObjectOrderAction(-1)}
          >
            <ChevronDown size={14} />
          </Button>
          <Button
            icon
            size="sm"
            variant="danger"
            label="Delete object"
            disabled={!selected}
            onClick={deleteSelectedObjectAction}
          >
            <Trash2 size={14} />
          </Button>
        </>
      }
    >
      {objects.length === 0 ? (
        <p className="panel-hint">Выдели ячейки и нажми Ctrl+G, чтобы собрать из них объект.</p>
      ) : (
        <ul className="item-list">
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
    </Panel>
  );
}
