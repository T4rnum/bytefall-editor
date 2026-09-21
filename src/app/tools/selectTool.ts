import {
  type Point,
  type Rect,
  clampRect,
  rectContains,
  rectFromPoints,
  translateRect,
} from '../../core/geometry';
import { moveRectEdits } from '../../core/selection';
import type { Tool, ToolEnv } from './types';

/** Прямоугольное выделение. Перетаскивание внутри выделения переносит ячейки. */
export function createSelectTool(): Tool {
  let mode: 'idle' | 'draw' | 'move' = 'idle';
  let anchor: Point = { x: 0, y: 0 };
  let origin: Rect | null = null;
  let moved = false;

  const clamp = (env: ToolEnv, rect: Rect): Rect | null =>
    clampRect(rect, env.doc.width, env.doc.height);

  return {
    id: 'select',
    label: 'Select',
    hotkey: 'm',
    cursor: 'cell',
    onPointerDown(env, info) {
      moved = false;
      anchor = info.cell;
      const sel = env.selection;
      if (sel && env.layer && info.button === 0 && rectContains(sel, info.cell.x, info.cell.y)) {
        mode = 'move';
        origin = sel;
        return;
      }
      mode = 'draw';
      env.setSelection(clamp(env, rectFromPoints(anchor, anchor)));
    },
    onPointerMove(env, info) {
      if (mode === 'draw') {
        moved = true;
        env.setSelection(clamp(env, rectFromPoints(anchor, info.cell)));
      } else if (mode === 'move' && origin && env.layer) {
        const dx = info.cell.x - anchor.x;
        const dy = info.cell.y - anchor.y;
        moved ||= dx !== 0 || dy !== 0;
        env.setSelection(translateRect(origin, dx, dy));
        env.setPreview(
          moveRectEdits(env.layer.cells, origin, dx, dy, env.doc.width, env.doc.height),
        );
      }
    },
    onPointerUp(env, info) {
      if (mode === 'draw' && !moved) {
        env.setSelection(null);
      } else if (mode === 'move' && origin) {
        const dx = info.cell.x - anchor.x;
        const dy = info.cell.y - anchor.y;
        env.setPreview(null);
        if (env.layer && (dx !== 0 || dy !== 0)) {
          const { width, height } = env.doc;
          env.commit(
            moveRectEdits(env.layer.cells, origin, dx, dy, width, height),
            'Move selection',
          );
        }
        env.setSelection(clamp(env, translateRect(origin, dx, dy)));
      }
      mode = 'idle';
      origin = null;
    },
    cancel(env) {
      env.setPreview(null);
      if (mode === 'move' && origin) env.setSelection(origin);
      mode = 'idle';
      origin = null;
    },
  };
}
