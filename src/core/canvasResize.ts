import { MAX_DIMENSION, MIN_DIMENSION, type ResizeAnchor } from './document';
import type { Point, Rect } from './geometry';

/**
 * Размер холста перетаскиванием краёв, как рамкой обрезки (ROADMAP, слой 10). Тянется край или
 * угол, противоположный стоит на месте: он и есть якорь для `resizeAnimation`.
 */

/** Стороны света: n — верх, s — низ, w — лево, e — право. Угол — две буквы. */
export type CanvasHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const clampSize = (v: number): number => Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, v));

/**
 * Ручка под точкой документа. Угол ловится в пределах `tolerance` от вершины, край — по всей
 * длине в пределах `tolerance` от линии. Углы важнее: они в пересечении двух краёв.
 */
export function canvasHandleAt(
  width: number,
  height: number,
  p: Point,
  tolerance: number,
  aspect = 1,
): CanvasHandle | null {
  // Допуск — в высотах ячейки: по X в ячейках он в `aspect` раз больше.
  const across = tolerance / aspect;
  const nearX = (x: number): boolean => Math.abs(p.x - x) <= across;
  const nearY = (y: number): boolean => Math.abs(p.y - y) <= tolerance;
  const alongX = p.x >= -across && p.x <= width + across;
  const alongY = p.y >= -tolerance && p.y <= height + tolerance;
  const v = nearY(0) && alongX ? 'n' : nearY(height) && alongX ? 's' : '';
  const h = nearX(0) && alongY ? 'w' : nearX(width) && alongY ? 'e' : '';
  const handle = `${v}${h}`;
  return handle === '' ? null : (handle as CanvasHandle);
}

export interface CanvasDrag {
  readonly width: number;
  readonly height: number;
  readonly anchor: ResizeAnchor;
  /** Новый холст в координатах старого: рамка для превью. */
  readonly rect: Rect;
}

/**
 * Новый размер, якорь и рамка после переноса ручки на (dx, dy) ячеек. Размер не выходит за
 * пределы формата, тянуть можно и внутрь — холст обрезается.
 */
export function dragCanvas(
  width: number,
  height: number,
  handle: CanvasHandle,
  dx: number,
  dy: number,
): CanvasDrag {
  const w = handle.includes('e')
    ? clampSize(width + dx)
    : handle.includes('w')
      ? clampSize(width - dx)
      : width;
  const h = handle.includes('s')
    ? clampSize(height + dy)
    : handle.includes('n')
      ? clampSize(height - dy)
      : height;
  const vertical = handle.includes('n') ? 'bottom' : handle.includes('s') ? 'top' : '';
  const horizontal = handle.includes('w') ? 'right' : handle.includes('e') ? 'left' : '';
  const anchor: ResizeAnchor =
    vertical && horizontal ? `${vertical}-${horizontal}` : vertical || horizontal || 'center';
  return {
    width: w,
    height: h,
    anchor,
    rect: {
      x: handle.includes('w') ? width - w : 0,
      y: handle.includes('n') ? height - h : 0,
      w,
      h,
    },
  };
}

/** CSS-курсор над ручкой: стрелка вдоль того, куда она тянется. */
export function canvasHandleCursor(handle: CanvasHandle): string {
  if (handle === 'n' || handle === 's') return 'ns-resize';
  if (handle === 'e' || handle === 'w') return 'ew-resize';
  return handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize';
}
