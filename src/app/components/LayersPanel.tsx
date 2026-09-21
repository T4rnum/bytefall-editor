import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { Layer } from '../../core/document';
import {
  addLayerAction,
  duplicateActiveLayerAction,
  moveActiveLayerAction,
  removeActiveLayerAction,
  updateLayerAction,
} from '../store/documentActions';
import { useDocumentStore } from '../store/documentStore';
import { Button, Panel, Slider, TextField } from '../ui';

function LayerRow({
  layer,
  active,
  onActivate,
}: {
  layer: Layer;
  active: boolean;
  onActivate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const VisibleIcon = layer.visible ? Eye : EyeOff;
  const LockIcon = layer.locked ? Lock : LockOpen;

  return (
    <li
      className={`item-row${active ? ' is-active' : ''}${layer.visible ? '' : ' is-hidden'}`}
      onClick={onActivate}
    >
      <Button
        icon
        size="sm"
        label={layer.visible ? 'Hide layer' : 'Show layer'}
        onClick={(e) => {
          e.stopPropagation();
          updateLayerAction(layer.id, { visible: !layer.visible }, 'Toggle visibility');
        }}
      >
        <VisibleIcon size={14} />
      </Button>
      <Button
        icon
        size="sm"
        active={layer.locked}
        label={layer.locked ? 'Unlock layer' : 'Lock layer'}
        onClick={(e) => {
          e.stopPropagation();
          updateLayerAction(layer.id, { locked: !layer.locked }, 'Toggle lock');
        }}
      >
        <LockIcon size={14} />
      </Button>
      {editing ? (
        <div className="item-name" onClick={(e) => e.stopPropagation()}>
          <TextField
            value={layer.name}
            size="sm"
            className="item-name-input"
            ariaLabel="Layer name"
            onCommit={(text) => {
              const name = text.trim();
              if (name && name !== layer.name)
                updateLayerAction(layer.id, { name }, 'Rename layer');
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
          {layer.name}
        </span>
      )}
      {layer.opacity < 1 && <span className="item-meta">{Math.round(layer.opacity * 100)}%</span>}
    </li>
  );
}

export function LayersPanel() {
  const doc = useDocumentStore((s) => s.doc);
  const activeLayerId = useDocumentStore((s) => s.activeLayerId);
  const setActiveLayer = useDocumentStore((s) => s.setActiveLayer);
  const active = doc.layers.find((l) => l.id === activeLayerId);
  /** Пока ползунок тянут, значение живёт локально: иначе каждый кадр жеста уйдёт в историю. */
  const [opacityDraft, setOpacityDraft] = useState<number | null>(null);
  const opacity = opacityDraft ?? Math.round((active?.opacity ?? 1) * 100);

  return (
    <Panel
      id="layers"
      title="Layers"
      badge={`${doc.layers.length}`}
      actions={
        <>
          <Button icon size="sm" label="Add layer" onClick={addLayerAction}>
            <Plus size={14} />
          </Button>
          <Button icon size="sm" label="Duplicate layer" onClick={duplicateActiveLayerAction}>
            <Copy size={14} />
          </Button>
          <Button icon size="sm" label="Move up" onClick={() => moveActiveLayerAction(1)}>
            <ChevronUp size={14} />
          </Button>
          <Button icon size="sm" label="Move down" onClick={() => moveActiveLayerAction(-1)}>
            <ChevronDown size={14} />
          </Button>
          <Button
            icon
            size="sm"
            variant="danger"
            label="Delete layer"
            disabled={doc.layers.length <= 1}
            onClick={removeActiveLayerAction}
          >
            <Trash2 size={14} />
          </Button>
        </>
      }
    >
      <ul className="item-list">
        {[...doc.layers].reverse().map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            active={layer.id === activeLayerId}
            onActivate={() => setActiveLayer(layer.id)}
          />
        ))}
      </ul>
      <Slider
        label="Opacity"
        value={opacity}
        min={0}
        max={100}
        suffix="%"
        disabled={!active}
        onChange={setOpacityDraft}
        onCommit={(value) => {
          setOpacityDraft(null);
          if (active) updateLayerAction(active.id, { opacity: value / 100 }, 'Layer opacity');
        }}
      />
    </Panel>
  );
}
