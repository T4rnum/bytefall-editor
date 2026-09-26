import {
  Bone,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Group,
  Lock,
  LockOpen,
  PencilLine,
  Plus,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { type CSSProperties, type MouseEvent, useState } from 'react';
import { findLayer } from '../../core/document';
import { objectOutline } from '../../core/hierarchy';
import { type SceneObject, findObject } from '../../core/object';
import { rangeSelection, toggleInSelection } from '../../core/objectSelection';
import { useDocumentStore } from '../store/documentStore';
import { useEditorStore } from '../store/editorStore';
import { pasteAction } from '../store/clipboardActions';
import {
  addEmptyObjectAction,
  copySelectedObjectAction,
  groupSelectionAction,
  updateObjectAction,
} from '../store/objectActions';
import { toggleEditModeAction } from '../store/objectEditActions';
import {
  deleteSelectedObjectsAction,
  duplicateSelectedObjectsAction,
  moveSelectedObjectsOrderAction,
  ungroupSelectedObjectsAction,
} from '../store/objectBatchActions';
import { doublePress, Button, Panel, TextField, plural } from '../ui';
import { OBJECTS } from './groupTargets';
import { ObjectEditBar } from './ObjectEditBar';
import { ObjectInspector } from './ObjectInspector';

interface RowProps {
  readonly object: SceneObject;
  /** Глубина в иерархии: ребёнок стоит под родителем с отступом. */
  readonly depth: number;
  readonly layerName: string;
  /** Главный выбранный — `active`, выбранный вместе с ним — `selected`. */
  readonly active: boolean;
  readonly selected: boolean;
  readonly onActivate: (event: MouseEvent) => void;
}

function ObjectRow({ object, depth, layerName, active, selected, onActivate }: RowProps) {
  const [editing, setEditing] = useState(false);
  // Переименование — только если оба нажатия пришлись на эту строку, см. `doublePress`.
  const [rename] = useState(() => doublePress(() => setEditing(true)));
  const VisibleIcon = object.visible ? Eye : EyeOff;
  const LockIcon = object.locked ? Lock : LockOpen;
  // Кость и контроллер без символов: значок говорит, что это риг, а не пустой объект.
  const KindIcon = object.rig?.kind === 'bone' ? Bone : object.rig ? Crosshair : null;

  return (
    <li
      className={`item-row${active ? ' is-active' : selected ? ' is-selected' : ''}${
        object.visible ? '' : ' is-hidden'
      }`}
      style={{ '--depth': depth } as CSSProperties}
      onClick={onActivate}
      // Shift по строке выбирает диапазон объектов, а не текст на странице.
      onMouseDown={(e) => {
        if (e.shiftKey) e.preventDefault();
      }}
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
      {KindIcon && <KindIcon size={12} className="item-kind" aria-hidden="true" />}
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
          onMouseDown={rename.onMouseDown}
          onDoubleClick={rename.onDoubleClick}
          title="Двойной щелчок — переименовать. Ctrl — добавить к выбору, Shift — диапазон"
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
  const selectedIds = useEditorStore((s) => s.selectedObjectIds);
  const editing = useEditorStore((s) => s.editingObjectId !== null);
  const hasSelection = useEditorStore((s) => s.selection !== null);
  const objectInClipboard = useEditorStore((s) => s.clipboard?.kind === 'object');
  const outline = objectOutline(doc);
  const selected = selectedId ? findObject(doc, selectedId) : undefined;
  const count = selectedIds.length;
  const many = count > 1;
  const order = outline.map((row) => row.object.id);
  /** Щелчок — один объект, Ctrl — добавить или убрать, Shift — всё от главного до этого. */
  const activate = (id: string, event: MouseEvent): void => {
    const editor = useEditorStore.getState();
    if (event.ctrlKey || event.metaKey) {
      editor.setSelectedObjects(toggleInSelection(editor.selectedObjectIds, id));
    } else if (event.shiftKey) {
      editor.setSelectedObjects(rangeSelection(order, editor.selectedObjectId, id));
    } else {
      editor.setSelectedObject(id);
    }
  };

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
            active={editing}
            label={
              editing
                ? 'Выйти из правки символов'
                : 'Править символы изнутри: рисовать в сетке объекта, выделять его символы'
            }
            hotkey="Tab"
            disabled={!selected || selected.rig !== null}
            onClick={toggleEditModeAction}
          >
            <PencilLine size={14} />
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
            label={
              many ? 'Разобрать выбранные: впечатать в слои' : 'Разобрать: впечатать объект в слой'
            }
            hotkey="Ctrl+Shift+G"
            disabled={!selected}
            onClick={ungroupSelectedObjectsAction}
          >
            <Ungroup size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label={many ? 'Дублировать выбранные' : 'Дублировать объект'}
            hotkey="Ctrl+D"
            disabled={!selected}
            onClick={duplicateSelectedObjectsAction}
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
            label={many ? 'Поднять выбранные' : 'Поднять объект'}
            disabled={!selected}
            onClick={() => moveSelectedObjectsOrderAction(1)}
          >
            <ChevronUp size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label={many ? 'Опустить выбранные' : 'Опустить объект'}
            disabled={!selected}
            onClick={() => moveSelectedObjectsOrderAction(-1)}
          >
            <ChevronDown size={14} />
          </Button>
          <Button
            icon
            size="sm"
            variant="danger"
            label={many ? 'Удалить выбранные' : 'Удалить объект'}
            disabled={!selected}
            onClick={deleteSelectedObjectsAction}
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
              selected={selectedIds.includes(object.id)}
              onActivate={(event) => activate(object.id, event)}
            />
          ))}
        </ul>
      )}
      <ObjectEditBar />
      {many && (
        <p className="panel-hint">
          Выбрано {plural(count, OBJECTS)}. Удаление, дублирование, перенос на слой, родитель, связи
          и деформеры — для всех; свойства ниже — у главного.
        </p>
      )}
      {selected && <ObjectInspector key={selected.id} object={selected} />}
    </Panel>
  );
}
