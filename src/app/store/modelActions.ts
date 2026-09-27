import { mapFrames } from '../../core/animation';
import { addLayer, createLayer, layerIndex, newId } from '../../core/document';
import { meshProblem, mergeUntextured, normalizeParts } from '../../core/scene3d/mesh';
import { addNode3D, createNode3D, createScene3D } from '../../core/scene3d/scene';
import { MAX_MESHES, MAX_NODES_3D, type Mesh3D, type MeshPart3D } from '../../core/scene3d/types';
import { MAX_FILE_BYTES, openModelFile } from '../io/files';
import { hasRoomForLayer } from './documentActions';
import { useDocumentStore } from './documentStore';
import { errorMessage, notify } from './notifyStore';
import { withScene } from './scene3dActions';

const state = () => useDocumentStore.getState();

/** Имя модели — имя файла без расширения. */
function modelName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName) || 'Модель';
}

/**
 * Модель в документ: телом в сцену активного 3D-слоя или, если активный слой не 3D, в новый
 * 3D-слой над ним. Одна запись истории на всё.
 */
export function addModelAction(name: string, parts: readonly MeshPart3D[]): void {
  const { doc, animation, activeLayerId, commitAnimation, setActiveLayer } = state();
  if (animation.meshes.length >= MAX_MESHES) {
    notify(`В документе не больше ${MAX_MESHES} моделей`, 'error');
    return;
  }
  const mesh: Mesh3D = { id: newId('mesh'), name, parts };
  const body = createNode3D('mesh', name, { mesh: mesh.id });
  const withMesh = { ...animation, meshes: [...animation.meshes, mesh] };
  const scene = doc.layers.find((l) => l.id === activeLayerId)?.scene;
  if (scene) {
    if (scene.nodes.length >= MAX_NODES_3D) {
      notify(`В 3D-сцене не больше ${MAX_NODES_3D} тел`, 'error');
      return;
    }
    commitAnimation(
      'Import 3D model',
      withScene(withMesh, activeLayerId, (s) => addNode3D(s, body)),
    );
    return;
  }
  if (!hasRoomForLayer(doc.layers.length)) return;
  const layer = { ...createLayer(name), scene: createScene3D([body]) };
  const index = layerIndex(doc, activeLayerId) + 1;
  commitAnimation(
    'Import 3D model',
    mapFrames(withMesh, (d) => addLayer(d, layer, index)),
  );
  setActiveLayer(layer.id);
}

/** Модель из файла glTF: и для выбора в диалоге, и для перетаскивания в окно. */
export async function importModelFileAction(file: File): Promise<void> {
  try {
    if (file.size > MAX_FILE_BYTES) throw new Error('файл больше 100 МБ');
    // Загрузчик glTF нужен только здесь: в основной бандл он не идёт.
    const { loadModelParts } = await import('../../render/scene3d/gltf');
    const parts = normalizeParts(mergeUntextured(await loadModelParts(await file.arrayBuffer())));
    const problem = meshProblem(parts);
    if (problem) throw new Error(problem);
    addModelAction(modelName(file.name), parts);
  } catch (error) {
    notify(`Не удалось открыть модель ${file.name}: ${errorMessage(error)}`, 'error');
  }
}

/** Выбрать файл glTF и поставить модель в 3D-сцену. */
export async function importModelAction(): Promise<void> {
  try {
    const file = await openModelFile();
    if (file) await importModelFileAction(file);
  } catch (error) {
    notify(`Не удалось открыть модель: ${errorMessage(error)}`, 'error');
  }
}
