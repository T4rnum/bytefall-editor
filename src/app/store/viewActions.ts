import { type CameraState, MAX_ZOOM, MIN_ZOOM, type SceneView } from '../../render/SceneView';
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

/** Длительность перехода камеры. Достаточно, чтобы глаз проследил, и мало, чтобы не мешать. */
const CAMERA_TWEEN_MS = 140;

let tween: number | null = null;

/** Любое прямое управление камерой отменяет переход: колесо и панорамирование важнее анимации. */
export function cancelCameraTween(): void {
  if (tween === null) return;
  cancelAnimationFrame(tween);
  tween = null;
}

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Плавный переход камеры к новому состоянию. Нужен там, где шаг дискретный: кнопки зума и
 * подгонка под окно иначе дёргают картинку скачком.
 *
 * Зум интерполируется геометрически, а не линейно: он умножается, поэтому равномерным на глаз
 * выглядит именно постоянный множитель, а не постоянная прибавка.
 */
function tweenCamera(to: CameraState): void {
  const { camera: from, setCamera } = useEditorStore.getState();
  cancelCameraTween();
  if (prefersReducedMotion() || from.zoom <= 0 || to.zoom <= 0) {
    setCamera(to);
    return;
  }
  const started = performance.now();
  const ratio = to.zoom / from.zoom;
  const step = (now: number): void => {
    const t = Math.min(1, (now - started) / CAMERA_TWEEN_MS);
    const eased = 1 - (1 - t) ** 3;
    useEditorStore.getState().setCamera({
      centerX: from.centerX + (to.centerX - from.centerX) * eased,
      centerY: from.centerY + (to.centerY - from.centerY) * eased,
      zoom: from.zoom * ratio ** eased,
    });
    tween = t < 1 ? requestAnimationFrame(step) : null;
  };
  tween = requestAnimationFrame(step);
}

export function zoomByAction(factor: number): void {
  const { camera } = useEditorStore.getState();
  tweenCamera({ ...camera, zoom: clampZoom(camera.zoom * factor) });
}

export function fitViewAction(): void {
  if (!activeView) return;
  const { doc } = useDocumentStore.getState();
  tweenCamera(activeView.fitCamera(doc.width, doc.height));
}
