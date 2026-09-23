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
import { useRef, useState } from 'react';
import type { Layer } from '../../core/document';
import {
  addLayerAction,
  duplicateActiveLayerAction,
  moveActiveLayerAction,
  removeActiveLayerAction,
  updateLayerAction,
} from '../store/documentActions';
import { useKeyState } from '../hooks/useKeyState';
import { useDocumentStore } from '../store/documentStore';
import { toggleKeyAction } from '../store/keyActions';
import { Button, KeyButton, Panel, Slider, TextField } from '../ui';

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
        label={layer.visible ? 'Скрыть слой' : 'Показать слой'}
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
        label={layer.locked ? 'Отпереть слой' : 'Запереть слой'}
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
            autoFocus
            ariaLabel="Имя слоя"
            onCommit={(text) => {
              const name = text.trim();
              if (name && name !== layer.name)
                updateLayerAction(layer.id, { name }, 'Rename layer');
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
  /**
   * Непрозрачность пишется в документ на каждое движение, чтобы холст менялся живьём.
   * Чтобы жест при этом остался одной записью истории, все правки внутри него помечаются
   * общим ключом серии, а отпускание указателя начинает новую серию.
   */
  const gesture = useRef(0);
  // Без округления: округление здесь съедало бы мелкий шаг, которым тянут с зажатым Shift.
  const opacity = (active?.opacity ?? 1) * 100;
  const opacityTarget = active
    ? ({ node: 'layer', id: active.id, property: 'opacity' } as const)
    : null;
  const opacityKey = useKeyState(opacityTarget);

  const setOpacity = (value: number): void => {
    if (!active || value === opacity) return;
    updateLayerAction(
      active.id,
      { opacity: value / 100 },
      'Layer opacity',
      `layer-opacity:${active.id}:${gesture.current}`,
    );
  };

  return (
    <Panel
      id="layers"
      title="Слои"
      badge={`${doc.layers.length}`}
      actions={
        <>
          <Button icon size="sm" label="Добавить слой" onClick={addLayerAction}>
            <Plus size={14} />
          </Button>
          <Button icon size="sm" label="Дублировать слой" onClick={duplicateActiveLayerAction}>
            <Copy size={14} />
          </Button>
          <Button icon size="sm" label="Поднять слой" onClick={() => moveActiveLayerAction(1)}>
            <ChevronUp size={14} />
          </Button>
          <Button icon size="sm" label="Опустить слой" onClick={() => moveActiveLayerAction(-1)}>
            <ChevronDown size={14} />
          </Button>
          <Button
            icon
            size="sm"
            variant="danger"
            label="Удалить слой"
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
      <div className="keyed">
        <Slider
          label="Непрозрачность"
          value={opacity}
          min={0}
          max={100}
          suffix="%"
          disabled={!active}
          onChange={setOpacity}
          onCommit={(value) => {
            setOpacity(value);
            // Отпускание указателя завершает серию: следующий жест станет отдельной отменой.
            gesture.current += 1;
          }}
        />
        <KeyButton
          state={opacityKey}
          subject="непрозрачность слоя"
          disabled={!active}
          onClick={() => opacityTarget && toggleKeyAction(opacityTarget)}
        />
      </div>
    </Panel>
  );
}
