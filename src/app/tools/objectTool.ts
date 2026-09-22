import { canEditLayer, findLayer } from '../../core/document';
import type { Point } from '../../core/geometry';
import {
  type SceneObject,
  findObject,
  objectAt,
  removeObject,
  updateObject,
} from '../../core/object';
import type { Tool, ToolEnv } from './types';

const NUDGE_FAST = 10;

function isMovable(env: ToolEnv, obj: SceneObject): boolean {
  return !obj.locked && canEditLayer(findLayer(env.doc, obj.layerId));
}

/**
 * Выбор и перенос объектов. Клик выбирает верхний объект под курсором, клик по пустому месту
 * снимает выбор, перетаскивание показывается через черновик документа и коммитится на отпускании.
 */
export function createObjectTool(): Tool {
  let dragId: string | null = null;
  let anchor: Point = { x: 0, y: 0 };
  let origin: Point = { x: 0, y: 0 };
  let moved = false;

  return {
    id: 'object',
    label: 'Объект',
    hotkey: 'v',
    cursor: 'default',
    onPointerDown(env, info) {
      if (info.button !== 0) return;
      const hit = objectAt(env.doc, info.cell.x, info.cell.y);
      env.setSelectedObject(hit ? hit.id : null);
      if (!hit || !isMovable(env, hit)) return;
      dragId = hit.id;
      anchor = info.cell;
      origin = { x: hit.x, y: hit.y };
      moved = false;
    },
    onPointerMove(env, info) {
      if (!dragId) return;
      const dx = info.cell.x - anchor.x;
      const dy = info.cell.y - anchor.y;
      if (dx === 0 && dy === 0 && !moved) return;
      moved = true;
      env.setDraft(updateObject(env.doc, dragId, { x: origin.x + dx, y: origin.y + dy }));
    },
    onPointerUp(env, info) {
      if (!dragId) return;
      const id = dragId;
      dragId = null;
      const dx = info.cell.x - anchor.x;
      const dy = info.cell.y - anchor.y;
      env.setDraft(null);
      if (moved && (dx !== 0 || dy !== 0)) {
        env.commitDocument(
          'Move object',
          updateObject(env.doc, id, { x: origin.x + dx, y: origin.y + dy }),
        );
      }
    },
    onKeyDown(env, event) {
      const id = env.selectedObjectId;
      if (!id || event.ctrlKey || event.metaKey || event.altKey) return false;
      const obj = findObject(env.doc, id);
      if (!obj) return false;
      const step = event.shiftKey ? NUDGE_FAST : 1;
      const nudge = (dx: number, dy: number): boolean => {
        if (isMovable(env, obj)) {
          env.commitDocument(
            'Nudge object',
            updateObject(env.doc, id, { x: obj.x + dx, y: obj.y + dy }),
          );
        }
        return true;
      };
      switch (event.key) {
        case 'ArrowLeft':
          return nudge(-step, 0);
        case 'ArrowRight':
          return nudge(step, 0);
        case 'ArrowUp':
          return nudge(0, -step);
        case 'ArrowDown':
          return nudge(0, step);
        case 'Delete':
        case 'Backspace':
          if (isMovable(env, obj)) {
            env.commitDocument('Delete object', removeObject(env.doc, id));
            env.setSelectedObject(null);
          }
          return true;
        case 'Escape':
          if (dragId) {
            // Отмена перетаскивания: объект остаётся выбранным, черновик сбрасывается.
            dragId = null;
            moved = false;
            env.setDraft(null);
          } else {
            env.setSelectedObject(null);
          }
          return true;
        default:
          return false;
      }
    },
    cancel(env) {
      dragId = null;
      env.setDraft(null);
    },
  };
}
