/**
 * Камера вьюпорта и чистая математика вокруг неё. Отдельно от SceneView, потому что здесь нет
 * ни Three.js, ни WebGL: это просто перевод координат, и он должен покрываться быстрыми тестами.
 *
 * Мир — в ячейках документа. Ячейка бывает неквадратной (`aspect` — ширина к высоте, см.
 * `core/font/font.ts`): зум — пикселей на высоту ячейки, по X ячейка занимает `zoom * aspect`.
 */

export interface CameraState {
  /** Мировая точка в центре вьюпорта. */
  readonly centerX: number;
  readonly centerY: number;
  /** Пикселей на высоту ячейки. */
  readonly zoom: number;
}

export const MIN_ZOOM = 2;
export const MAX_ZOOM = 128;

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

export const clampZoom = (zoom: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

/**
 * Экранная точка в мировые координаты. Ось Y мира смотрит вверх, а экрана вниз, отсюда знак.
 */
export function screenToWorld(
  camera: CameraState,
  view: ViewSize,
  px: number,
  py: number,
  aspect = 1,
): { x: number; y: number } {
  return {
    x: camera.centerX + (px - view.width / 2) / (camera.zoom * aspect),
    y: camera.centerY - (py - view.height / 2) / camera.zoom,
  };
}

/**
 * Масштабирование вокруг точки под курсором: точка остаётся на месте, всё остальное
 * расходится или сходится к ней. Без этого колесо тянуло бы картинку к центру окна.
 */
export function zoomAroundPoint(
  camera: CameraState,
  view: ViewSize,
  px: number,
  py: number,
  factor: number,
  aspect = 1,
): CameraState {
  const zoom = clampZoom(camera.zoom * factor);
  const anchor = screenToWorld(camera, view, px, py, aspect);
  return {
    centerX: anchor.x - (px - view.width / 2) / (zoom * aspect),
    centerY: anchor.y + (py - view.height / 2) / zoom,
    zoom,
  };
}

/**
 * Промежуточное состояние перехода. Зум интерполируется геометрически, а не линейно: он
 * умножается, поэтому равномерным на глаз выглядит постоянный множитель, а не постоянная прибавка.
 */
export function lerpCamera(from: CameraState, to: CameraState, t: number): CameraState {
  return {
    centerX: from.centerX + (to.centerX - from.centerX) * t,
    centerY: from.centerY + (to.centerY - from.centerY) * t,
    zoom: from.zoom * (to.zoom / from.zoom) ** t,
  };
}

/** Камера, вписывающая документ в окно. Зум целый, чтобы пиксели глифов оставались ровными. */
export function fitCamera(
  view: ViewSize,
  width: number,
  height: number,
  padding = 24,
  aspect = 1,
): CameraState {
  const zoomX = (view.width - padding * 2) / (width * aspect);
  const zoomY = (view.height - padding * 2) / height;
  return {
    centerX: width / 2,
    centerY: -height / 2,
    zoom: clampZoom(Math.floor(Math.min(zoomX, zoomY))),
  };
}
