import type { Box, Point } from './nodeLayout';

/**
 * Взгляд на поле редактора узлов: точка поля в левом верхнем углу и масштаб. Экранная точка —
 * `(поле − угол) · масштаб`, в пикселях от угла редактора.
 */
export interface NodeView {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const MIN_NODE_ZOOM = 0.25;
export const MAX_NODE_ZOOM = 2;
/** Поле вокруг вписанного графа, в пикселях. */
const FIT_MARGIN = 32;

const clampZoom = (zoom: number): number => Math.min(MAX_NODE_ZOOM, Math.max(MIN_NODE_ZOOM, zoom));

export const toGraph = (view: NodeView, sx: number, sy: number): Point => ({
  x: view.x + sx / view.zoom,
  y: view.y + sy / view.zoom,
});

export const toScreen = (view: NodeView, p: Point): Point => ({
  x: (p.x - view.x) * view.zoom,
  y: (p.y - view.y) * view.zoom,
});

/** Сдвиг взгляда на экранные пиксели: поле едет за указателем. */
export const panBy = (view: NodeView, dx: number, dy: number): NodeView => ({
  ...view,
  x: view.x - dx / view.zoom,
  y: view.y - dy / view.zoom,
});

/** Масштаб в `factor` раз вокруг экранной точки: точка поля под ней остаётся под ней. */
export function zoomAt(view: NodeView, sx: number, sy: number, factor: number): NodeView {
  const zoom = clampZoom(view.zoom * factor);
  const anchor = toGraph(view, sx, sy);
  return { zoom, x: anchor.x - sx / zoom, y: anchor.y - sy / zoom };
}

/** Взгляд, при котором `box` целиком в окне `width × height`, по центру; крупнее 1:1 — нет. */
export function fitView(box: Box | null, width: number, height: number): NodeView {
  if (!box) return { x: -FIT_MARGIN, y: -FIT_MARGIN, zoom: 1 };
  const room = (size: number): number => Math.max(1, size - 2 * FIT_MARGIN);
  const zoom = clampZoom(Math.min(1, room(width) / box.width, room(height) / box.height));
  return {
    zoom,
    x: box.x + box.width / 2 - width / 2 / zoom,
    y: box.y + box.height / 2 - height / 2 / zoom,
  };
}
