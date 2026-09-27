import { FileBox, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { findLayer } from '../../../core/document';
import { type Node3DKind, PRIMITIVES_3D } from '../../../core/scene3d/types';
import { KIND_3D_LABELS } from '../../scene3d/labels';
import { useDocumentStore } from '../../store/documentStore';
import { importModelAction } from '../../store/modelActions';
import { addBody3DAction, removeBody3DAction } from '../../store/scene3dActions';
import { Button, Panel, Select, type SelectOption } from '../../ui';
import { Body3DFields } from './Body3DFields';
import { Camera3DFields, Light3DFields } from './Camera3DFields';
import { Look3DFields } from './Look3DFields';
import { Render3DFields } from './Render3DFields';

const KINDS: readonly SelectOption<Node3DKind>[] = PRIMITIVES_3D.map((kind) => ({
  value: kind,
  label: KIND_3D_LABELS[kind],
}));

/**
 * 3D-сцена активного слоя: тела, камера, свет и то, как рендер становится символами. Панель
 * видна, только когда активный слой — 3D. Значения — из вычисленной сцены в момент указателя.
 */
export function Scene3DPanel() {
  const doc = useDocumentStore((s) => s.doc);
  const activeLayerId = useDocumentStore((s) => s.activeLayerId);
  const [kind, setKind] = useState<Node3DKind>('box');
  const selected = useEditorStore((s) => s.selectedBody3D);
  const setSelected = useEditorStore((s) => s.setSelectedBody3D);
  const layer = findLayer(doc, activeLayerId);
  const scene = layer?.scene;
  if (!layer || !scene) return null;
  const body = scene.nodes.find((n) => n.id === selected) ?? scene.nodes[0];

  return (
    <Panel
      id="scene3d"
      title="3D-сцена"
      badge={layer.name}
      actions={
        <>
          <Select
            value={kind}
            options={KINDS}
            size="sm"
            ariaLabel="Какое тело добавить"
            onChange={setKind}
          />
          <Button
            icon
            size="sm"
            label="Добавить тело в сцену"
            onClick={() => setSelected(addBody3DAction(layer.id, kind))}
          >
            <Plus size={14} />
          </Button>
          <Button
            icon
            size="sm"
            label="Модель glTF в сцену: .glb или .gltf со встроенными данными"
            hotkey="Ctrl+Shift+M"
            onClick={() => void importModelAction()}
          >
            <FileBox size={14} />
          </Button>
        </>
      }
    >
      {scene.nodes.length === 0 ? (
        <p className="panel-hint">Сцена пуста: добавь тело или перетащи модель glTF в окно.</p>
      ) : (
        <ul className="fx-list">
          {scene.nodes.map((n) => (
            <li key={n.id} className={`fx-row scene3d-body${n === body ? ' is-selected' : ''}`}>
              <div className="fx-head">
                <button
                  type="button"
                  className="scene3d-body-name"
                  onClick={() => setSelected(n.id)}
                >
                  {n.name}
                </button>
                <Button
                  icon
                  size="sm"
                  variant="danger"
                  label="Убрать тело из сцены"
                  onClick={() => removeBody3DAction(layer.id, n.id)}
                >
                  <X size={14} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {body && <Body3DFields key={body.id} layerId={layer.id} body={body} />}
      <h4 className="inspector-heading">Камера</h4>
      <Camera3DFields layerId={layer.id} scene={scene} />
      <h4 className="inspector-heading">Свет</h4>
      <Light3DFields layerId={layer.id} scene={scene} />
      <h4 className="inspector-heading">Символы</h4>
      <Render3DFields layerId={layer.id} scene={scene} />
      <Look3DFields
        layerId={layer.id}
        quantize={scene.quantize}
        cloud={scene.render.mode === 'cloud'}
      />
    </Panel>
  );
}
