import { makeCell } from '../../core/cell';
import { type Point, inBounds } from '../../core/geometry';
import { editsFromPoints } from '../../core/grid';
import type { Tool, ToolEnv } from './types';

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/** Текст: клик ставит курсор, дальше символы печатаются с клавиатуры. */
export function createTextTool(): Tool {
  let lineStart = 0;

  const moveTo = (env: ToolEnv, x: number, y: number): void => {
    env.setTextCursor({ x: clamp(x, 0, env.doc.width - 1), y: clamp(y, 0, env.doc.height - 1) });
  };

  const write = (env: ToolEnv, at: Point, key: string): void => {
    if (!env.layer) return;
    const glyph = key === ' ' ? '' : key;
    const cell =
      glyph === '' && env.brush.bg === null ? null : makeCell(glyph, env.brush.fg, env.brush.bg);
    env.commit(editsFromPoints([at], cell), 'Type');
  };

  return {
    id: 'text',
    label: 'Текст',
    hotkey: 't',
    cursor: 'text',
    onPointerDown(env, info) {
      if (!inBounds(info.cell.x, info.cell.y, env.doc.width, env.doc.height)) return;
      lineStart = info.cell.x;
      env.setTextCursor(info.cell);
    },
    onKeyDown(env, event) {
      const cursor = env.textCursor;
      if (!cursor) return false;
      switch (event.key) {
        case 'Escape':
          env.setTextCursor(null);
          return true;
        case 'ArrowLeft':
          moveTo(env, cursor.x - 1, cursor.y);
          return true;
        case 'ArrowRight':
          moveTo(env, cursor.x + 1, cursor.y);
          return true;
        case 'ArrowUp':
          moveTo(env, cursor.x, cursor.y - 1);
          return true;
        case 'ArrowDown':
          moveTo(env, cursor.x, cursor.y + 1);
          return true;
        case 'Enter':
          moveTo(env, lineStart, cursor.y + 1);
          return true;
        case 'Home':
          moveTo(env, lineStart, cursor.y);
          return true;
        case 'Backspace': {
          const x = cursor.x - 1;
          if (x >= 0 && env.layer)
            env.commit(editsFromPoints([{ x, y: cursor.y }], null), 'Backspace');
          moveTo(env, x, cursor.y);
          return true;
        }
        case 'Delete':
          if (env.layer) env.commit(editsFromPoints([cursor], null), 'Delete');
          return true;
        default:
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            write(env, cursor, event.key);
            moveTo(env, cursor.x + 1, cursor.y);
            return true;
          }
          return false;
      }
    },
    cancel(env) {
      env.setTextCursor(null);
    },
  };
}
