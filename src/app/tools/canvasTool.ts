import {
  type CanvasHandle,
  canvasHandleAt,
  canvasHandleCursor,
  dragCanvas,
} from '../../core/canvasResize';
import type { Point } from '../../core/geometry';
import { HANDLE_HIT_PX } from './gizmo';
import type { PointerInfo, Tool, ToolEnv } from './types';

/**
 * Холст: размер перетаскиванием краёв и углов, как рамкой обрезки. Тянуть можно наружу и внутрь,
 * противоположный край стоит на месте. Пока тянут, видна рамка будущего холста; на отпускании
 * размер меняется во всех кадрах одной записью. Диалог Ctrl+Alt+C остаётся для точных чисел.
 */
export function createCanvasTool(): Tool {
  let gesture: { readonly handle: CanvasHandle; readonly from: Point } | null = null;

  const handleAt = (env: ToolEnv, info: PointerInfo): CanvasHandle | null =>
    canvasHandleAt(env.doc.width, env.doc.height, info.point, HANDLE_HIT_PX / env.zoom, env.aspect);

  const result = (env: ToolEnv, info: PointerInfo) => {
    if (!gesture) return null;
    const dx = Math.round(info.point.x - gesture.from.x);
    const dy = Math.round(info.point.y - gesture.from.y);
    return dragCanvas(env.doc.width, env.doc.height, gesture.handle, dx, dy);
  };

  const stop = (env: ToolEnv): void => {
    gesture = null;
    env.setCanvasFrame(null);
  };

  return {
    id: 'canvas',
    label: 'Холст',
    hotkey: 'c',
    cursor: 'default',
    onPointerDown(env, info) {
      if (info.button !== 0) return;
      const handle = handleAt(env, info);
      if (handle) gesture = { handle, from: info.point };
    },
    onPointerMove(env, info) {
      const next = result(env, info);
      if (next) env.setCanvasFrame(next.rect);
    },
    onPointerUp(env, info) {
      const next = result(env, info);
      stop(env);
      if (next && (next.width !== env.doc.width || next.height !== env.doc.height)) {
        env.resizeCanvas(next.width, next.height, next.anchor);
      }
    },
    hoverCursor(env, info) {
      const handle = handleAt(env, info);
      return handle ? canvasHandleCursor(handle) : null;
    },
    onKeyDown(env, event) {
      if (event.key !== 'Escape' || !gesture) return false;
      stop(env);
      return true;
    },
    cancel(env) {
      stop(env);
    },
  };
}
