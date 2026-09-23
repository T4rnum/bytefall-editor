import {
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Group,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { findLayer } from '../../core/document';
import { objectOutline } from '../../core/hierarchy';
import { type SceneObject, findObject } from '../../core/object';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { pasteAction } from '../store/clipboardActions';
import {
  addEmptyObjectAction,
  copySelectedObjectAction,
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
  /** Глубина в иерархии: ребёнок стоит под родителем с отступом. */
  readonly depth: number;
  readonly layerName: string;
  readonly active: boolean;
  readonly onActivate: () => void;
}

function ObjectRow({ object, depth, layerName, active, onActivate }: RowProps) {
  const [editing, setEditing] = useState(false);
  const VisibleIcon = object.visible ? Eye : EyeOff;
  const LockIcon = object.locked ? Lock : LockOpen;

  return (
    <li
      className={`item-row${active ? ' is-active' : ''}${object.visible ? '' : ' is-hidden'}`}
      style={{ '--depth': depth } as CSSProperties}
      onClick={onActivate}
    >
      <Button
        icon
        size="sm"
        label={object.visible ? 'Скрыть объект' : 'Показать объект'}
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
        label={object.locked ? 'Отпереть объект' : 'Запереть объект'}
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
            autoFocus
            ariaLabel="Имя объекта"
            onCommit={(text) => {
              const name = text.trim();
              if (name && name !== object.name) {
                updateObjectAction(object.id, { name }, 'Rename object');
              }
            }}
            onFinish={() => setEditing(false)}
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
  const objectInClipboard = useEditorStore((s) => s.clipboard?.kind === 'object');
  const outline = objectOutline(doc);
  const selected = selectedId ? findObject(doc, selectedId) : undefined;

  return (
    <Panel
      id="objects"
      title="Объекты"
      badge={outline.length > 0 ? `${outline.length}` : undefined}
      actions={
        <>
          <Button
            icon
            size="sm"
            label="Собрать выделение в объект"
            hotkey="Ctrl+G"
            disabled={!hasSelection}
            onClick={groupSelectionAction}
          >
            <Group size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Пустой объект: к нему привязывают детей и крутят их вместе"
            hotkey="Shift+A"
            onClick={addEmptyObjectAction}
          >
            <Plus size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Разобрать: впечатать объект в слой"
            hotkey="Ctrl+Shift+G"
            disabled={!selected}
            onClick={ungroupSelectedObjectAction}
          >
            <Ungroup size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Дублировать объект"
            hotkey="Ctrl+D"
            disabled={!selected}
            onClick={duplicateSelectedObjectAction}
          >
            <Copy size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Копировать объект"
            hotkey="Ctrl+C"
            disabled={!selected}
            onClick={copySelectedObjectAction}
          >
            <ClipboardCopy size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Вставить объект на активный слой"
            hotkey="Ctrl+V"
            disabled={!objectInClipboard}
            onClick={pasteAction}
          >
            <ClipboardPaste size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Поднять объект"
            disabled={!selected}
            onClick={() => moveSelectedObjectOrderAction(1)}
          >
            <ChevronUp size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Опустить объект"
            disabled={!selected}
            onClick={() => moveSelectedObjectOrderAction(-1)}
          >
            <ChevronDown size={14} />
          </Button>
          <Button
            icon
            size="sm"
            variant="danger"
            label="Удалить объект"
            disabled={!selected}
            onClick={deleteSelectedObjectAction}
          >
            <Trash2 size={14} />
          </Button>
        </>
      }
    >
      {outline.length === 0 ? (
        <p className="panel-hint">Выдели ячейки и нажми Ctrl+G, чтобы собрать из них объект.</p>
      ) : (
        <ul className="item-list">
          {outline.map(({ object, depth }) => (
            <ObjectRow
              key={object.id}
              object={object}
              depth={depth}
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
