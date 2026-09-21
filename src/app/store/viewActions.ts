import { MAX_ZOOM, MIN_ZOOM, type SceneView } from '../../render/SceneView';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';

let activeView: SceneView | null = null;

/** Вьюпорт регистрирует свою сцену, чтобы действия (экспорт, подгонка) могли до неё дотянуться. */
export function setActiveView(view: SceneView | null): void {
  activeView = view;
}

export function getActiveView(): SceneView | null {
  return activeView;
}

export const clampZoom = (zoom: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

export function zoomByAction(factor: number): void {
  const { camera, setCamera } = useEditorStore.getState();
  setCamera({ ...camera, zoom: clampZoom(camera.zoom * factor) });
}

export function fitViewAction(): void {
  if (!activeView) return;
  const { doc } = useDocumentStore.getState();
  useEditorStore.getState().setCamera(activeView.fitCamera(doc.width, doc.height));
}
