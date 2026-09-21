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
      className={`layer-row${active ? ' is-active' : ''}${layer.visible ? '' : ' is-hidden'}`}
      onClick={onActivate}
    >
      <button
        type="button"
        className="icon-btn icon-btn--small"
        title={layer.visible ? 'Hide' : 'Show'}
        onClick={(e) => {
          e.stopPropagation();
          updateLayerAction(layer.id, { visible: !layer.visible }, 'Toggle visibility');
        }}
      >
        <VisibleIcon size={14} />
      </button>
      <button
        type="button"
        className={`icon-btn icon-btn--small${layer.locked ? ' is-active' : ''}`}
        title={layer.locked ? 'Unlock' : 'Lock'}
        onClick={(e) => {
          e.stopPropagation();
          updateLayerAction(layer.id, { locked: !layer.locked }, 'Toggle lock');
        }}
      >
        <LockIcon size={14} />
      </button>
      {editing ? (
        <input
          className="layer-name-input"
          autoFocus
          defaultValue={layer.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== layer.name) updateLayerAction(layer.id, { name }, 'Rename layer');
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
          {layer.name}
        </span>
      )}
      {layer.opacity < 1 && (
        <span className="layer-opacity">{Math.round(layer.opacity * 100)}%</span>
      )}
    </li>
  );
}

export function LayersPanel() {
  const doc = useDocumentStore((s) => s.doc);
  const activeLayerId = useDocumentStore((s) => s.activeLayerId);
  const setActiveLayer = useDocumentStore((s) => s.setActiveLayer);
  const active = doc.layers.find((l) => l.id === activeLayerId);
  const [opacityDraft, setOpacityDraft] = useState<number | null>(null);
  const opacity = opacityDraft ?? Math.round((active?.opacity ?? 1) * 100);

  const commitOpacity = (): void => {
    if (opacityDraft !== null && active) {
      updateLayerAction(active.id, { opacity: opacityDraft / 100 }, 'Layer opacity');
    }
    setOpacityDraft(null);
  };

  return (
    <section className="panel">
      <header className="panel-header">
        <span>Layers</span>
        <div className="panel-actions">
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Add layer"
            onClick={addLayerAction}
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Duplicate layer"
            onClick={duplicateActiveLayerAction}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Move up"
            onClick={() => moveActiveLayerAction(1)}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Move down"
            onClick={() => moveActiveLayerAction(-1)}
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--small"
            title="Delete layer"
            disabled={doc.layers.length <= 1}
            onClick={removeActiveLayerAction}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </header>
      <ul className="layer-list">
        {[...doc.layers].reverse().map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            active={layer.id === activeLayerId}
            onActivate={() => setActiveLayer(layer.id)}
          />
        ))}
      </ul>
      <label className="range-row">
        <span>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          disabled={!active}
          onChange={(e) => setOpacityDraft(Number(e.target.value))}
          onPointerUp={commitOpacity}
          onKeyUp={commitOpacity}
          onBlur={commitOpacity}
        />
        <span className="range-value">{opacity}%</span>
      </label>
    </section>
  );
}
