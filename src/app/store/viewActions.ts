import { type CameraState, clampZoom, lerpCamera, zoomAroundPoint } from '../../render/camera';
import type { SceneView } from '../../render/SceneView';
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

export { clampZoom } from '../../render/camera';

/** Длительность перехода камеры. Достаточно, чтобы глаз проследил, и мало, чтобы не мешать. */
const CAMERA_TWEEN_MS = 140;
/** Колесо крутят подряд, поэтому его переход короче: иначе камера заметно отстаёт от руки. */
const WHEEL_TWEEN_MS = 90;

let tween: number | null = null;
/**
 * Страховка на случай, если кадры анимации не идут: свёрнутое окно, перекрытая вкладка, удалённый
 * рабочий стол. Анимация — это украшение, и её отсутствие не должно терять сам ввод.
 */
let fallback: ReturnType<typeof setTimeout> | null = null;
/** Куда камера едет прямо сейчас. Нужна, чтобы следующий шаг колеса считался от цели, а не от
 * промежуточного положения: иначе быстрые прокрутки теряли бы часть пути. */
let target: CameraState | null = null;

/** Снимает оба таймера перехода, не трогая цель. */
function stopTimers(): void {
  if (tween !== null) cancelAnimationFrame(tween);
  if (fallback !== null) clearTimeout(fallback);
  tween = null;
  fallback = null;
}

/** Любое прямое управление камерой отменяет переход: панорамирование важнее анимации. */
export function cancelCameraTween(): void {
  stopTimers();
  target = null;
}

/** Состояние, от которого считается следующий шаг: цель текущего перехода либо сама камера. */
export function pendingCamera(): CameraState {
  return target ?? useEditorStore.getState().camera;
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
export function tweenCameraTo(to: CameraState, durationMs = CAMERA_TWEEN_MS): void {
  const { camera: from, setCamera } = useEditorStore.getState();
  // Снимаем оба таймера предыдущего перехода. Если оставить страховку, она сработает позже
  // и вернёт камеру к уже устаревшей цели, потеряв часть накопленного ввода.
  stopTimers();
  if (prefersReducedMotion() || from.zoom <= 0 || to.zoom <= 0) {
    target = null;
    setCamera(to);
    return;
  }
  target = to;
  const started = performance.now();
  const finish = (): void => {
    stopTimers();
    target = null;
    useEditorStore.getState().setCamera(to);
  };
  const step = (now: number): void => {
    const t = Math.min(1, (now - started) / durationMs);
    if (t >= 1) {
      finish();
      return;
    }
    useEditorStore.getState().setCamera(lerpCamera(from, to, 1 - (1 - t) ** 3));
    tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
  // Если кадр так и не пришёл, доводим камеру до цели без анимации.
  fallback = setTimeout(finish, durationMs + 250);
}

/**
 * Шаг колеса. Считается от цели текущего перехода, поэтому несколько быстрых щелчков
 * складываются полностью, а камера догоняет их одним плавным движением.
 */
export function zoomWheelAction(px: number, py: number, factor: number): void {
  if (!activeView) return;
  tweenCameraTo(zoomAroundPoint(pendingCamera(), activeView.size, px, py, factor), WHEEL_TWEEN_MS);
}

export function zoomByAction(factor: number): void {
  const camera = pendingCamera();
  tweenCameraTo({ ...camera, zoom: clampZoom(camera.zoom * factor) });
}

export function fitViewAction(): void {
  if (!activeView) return;
  const { doc } = useDocumentStore.getState();
  tweenCameraTo(activeView.fitCamera(doc.width, doc.height));
}
