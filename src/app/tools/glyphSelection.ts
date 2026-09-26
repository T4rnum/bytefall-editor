import type { Point } from '../../core/geometry';
import {
  combineGlyphs,
  glyphAt,
  glyphsInPolygon,
  glyphsInRect,
  similarGlyphs,
} from '../../core/glyphPick';
import type { CellKey } from '../../core/grid';
import type { SelectionMode } from '../../core/selection';
import type { EditSession, PointerInfo, ToolEnv } from './types';

export type GlyphSelectorKind = 'select' | 'lasso' | 'wand';

/** Дальше этого, в ячейках, указатель уходит — и щелчок становится протяжкой. */
const CLICK_SLOP = 0.25;

/**
 * Инструменты выделения в правке изнутри: ловят символы объекта там, где их видно, — центр
 * символа внутри рамки или лассо, палочка — по символу под указателем. Щелчок по символу
 * выбирает его, по пустому месту — снимает выделение. Перетаскивание выделенного символа
 * двигает выделенные по сетке объекта.
 */
export interface GlyphSelector {
  down(env: ToolEnv, info: PointerInfo, mode: SelectionMode): void;
  move(env: ToolEnv, info: PointerInfo): void;
  up(env: ToolEnv, info: PointerInfo): void;
  cancel(env: ToolEnv): void;
}

export function createGlyphSelector(kind: GlyphSelectorKind): GlyphSelector {
  let state: 'idle' | 'draw' | 'move' = 'idle';
  let mode: SelectionMode = 'replace';
  let base: readonly CellKey[] = [];
  let path: Point[] = [];
  let anchor: Point | null = null;
  let moved = false;

  /** Что поймал жест сейчас: рамка по двум точкам, лассо по пути, палочка — под указателем. */
  const caught = (s: EditSession, env: ToolEnv): CellKey[] => {
    const placed = s.placed();
    if (kind === 'wand') {
      const hit = glyphAt(placed, path[path.length - 1]);
      return hit === null ? [] : similarGlyphs(s.object, hit, env.wandContiguous);
    }
    if (kind === 'lasso') return glyphsInPolygon(placed, path);
    return glyphsInRect(placed, rectOf(path[0], path[path.length - 1]));
  };

  const show = (s: EditSession, env: ToolEnv): void => {
    s.setGlyphs(combineGlyphs(base, caught(s, env), mode));
    if (kind === 'select') s.setMarquee(corners(path[0], path[path.length - 1]));
    if (kind === 'lasso') s.setMarquee([...path]);
  };

  const delta = (s: EditSession, info: PointerInfo): Point => {
    const cell = s.cellAt(info.point);
    return cell && anchor ? { x: cell.x - anchor.x, y: cell.y - anchor.y } : { x: 0, y: 0 };
  };

  const reset = (s: EditSession | null): void => {
    state = 'idle';
    path = [];
    anchor = null;
    s?.setMarquee(null);
  };

  return {
    down(env, info, gestureMode) {
      const s = env.editing;
      if (!s) return;
      moved = false;
      const hit = glyphAt(s.placed(), info.point);
      if (
        gestureMode === 'replace' &&
        info.button === 0 &&
        hit !== null &&
        s.glyphs.includes(hit)
      ) {
        state = 'move';
        anchor = s.cellAt(info.point);
        return;
      }
      state = 'draw';
      mode = gestureMode;
      base = s.glyphs;
      path = [info.point];
      if (kind === 'wand') show(s, env);
    },
    move(env, info) {
      const s = env.editing;
      if (!s) return;
      if (state === 'draw') {
        const start = path[0];
        moved ||= Math.hypot(info.point.x - start.x, info.point.y - start.y) > CLICK_SLOP;
        path.push(info.point);
        if (moved) show(s, env);
      } else if (state === 'move') {
        const d = delta(s, info);
        moved ||= d.x !== 0 || d.y !== 0;
        s.previewMove(d.x, d.y);
      }
    },
    up(env, info) {
      const s = env.editing;
      if (s && state === 'draw') {
        path.push(info.point);
        if (!moved && kind !== 'wand') {
          // Щелчок: символ под указателем или пустота. Модификаторы работают и тут.
          const hit = glyphAt(s.placed(), info.point);
          s.setGlyphs(combineGlyphs(base, hit === null ? [] : [hit], mode));
        } else {
          show(s, env);
        }
      } else if (s && state === 'move') {
        const d = delta(s, info);
        s.commitMove(d.x, d.y);
      }
      reset(s);
    },
    cancel(env) {
      const s = env.editing;
      if (s && state === 'move') s.previewMove(0, 0);
      if (s && state === 'draw') s.setGlyphs(base);
      reset(s);
    },
  };
}

function rectOf(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  };
}

const corners = (a: Point, b: Point): Point[] => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
