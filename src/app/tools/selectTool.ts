import { floodFill, similarCells } from '../../core/fill';
import { type Point, clampRect, iterateRect, rectFromPoints } from '../../core/geometry';
import { polygonCells } from '../../core/polygon';
import {
  type Selection,
  type SelectionMode,
  combineSelection,
  moveSelectionEdits,
  selectionContains,
  selectionFromPoints,
  translateSelection,
} from '../../core/selection';
import type { PointerInfo, Tool, ToolEnv } from './types';

/** Shift добавляет к выделению, Alt вычитает, без модификаторов жест заменяет прежнее. */
const modeOf = (info: PointerInfo): SelectionMode =>
  info.shift ? 'add' : info.alt ? 'subtract' : 'replace';

/** Чем жест отличается от других: что показывать по ходу и что выделить на отпускании. */
interface SelectionGesture {
  /** Ячейки, подсвеченные во время жеста. `path` — пройденные ячейки, начиная с нажатия. */
  live(env: ToolEnv, path: readonly Point[]): Point[];
  /** Ячейки, уходящие в выделение на отпускании кнопки. */
  commit(env: ToolEnv, path: readonly Point[]): Point[];
  /** Снимает ли щелчок без движения выделение. У палочки щелчок — это и есть весь жест. */
  readonly clearsOnClick: boolean;
}

/**
 * Общая часть всех выделений: накопление пути, модификаторы и перенос содержимого.
 * Перетаскивание внутри готового выделения двигает ячейки, а не начинает новое.
 */
function createSelectionTool(
  id: 'select' | 'lasso' | 'wand',
  label: string,
  hotkey: string,
  cursor: string,
  gesture: SelectionGesture,
): Tool {
  let mode: 'idle' | 'draw' | 'move' = 'idle';
  let combine: SelectionMode = 'replace';
  let path: Point[] = [];
  let base: Selection | null = null;
  let anchor: Point = { x: 0, y: 0 };
  let origin: Selection | null = null;
  let moved = false;

  const show = (env: ToolEnv, cells: Point[]): void => {
    const next = selectionFromPoints(cells, env.doc.width, env.doc.height);
    env.setSelection(combineSelection(base, next, combine));
  };

  const track = (info: PointerInfo): void => {
    const last = path[path.length - 1];
    if (!last || last.x !== info.cell.x || last.y !== info.cell.y) path.push(info.cell);
  };

  return {
    id,
    label,
    hotkey,
    cursor,
    ownsAlt: true,
    ignoresSelection: true,
    onPointerDown(env, info) {
      moved = false;
      anchor = info.cell;
      const sel = env.selection;
      if (
        sel &&
        env.layer &&
        info.button === 0 &&
        modeOf(info) === 'replace' &&
        selectionContains(sel, info.cell.x, info.cell.y)
      ) {
        mode = 'move';
        origin = sel;
        return;
      }
      mode = 'draw';
      combine = modeOf(info);
      base = env.selection;
      path = [info.cell];
      show(env, gesture.live(env, path));
    },
    onPointerMove(env, info) {
      if (mode === 'draw') {
        moved = true;
        track(info);
        show(env, gesture.live(env, path));
      } else if (mode === 'move' && origin && env.layer) {
        const dx = info.cell.x - anchor.x;
        const dy = info.cell.y - anchor.y;
        moved ||= dx !== 0 || dy !== 0;
        const { width, height } = env.doc;
        env.setSelection(translateSelection(origin, dx, dy, width, height));
        env.setPreview(moveSelectionEdits(env.layer.cells, origin, dx, dy, width, height));
      }
    },
    onPointerUp(env, info) {
      if (mode === 'draw') {
        track(info);
        // Щелчок без движения и без модификаторов снимает выделение: так у всех редакторов.
        if (!moved && combine === 'replace' && gesture.clearsOnClick) {
          env.setSelection(null);
        } else {
          show(env, gesture.commit(env, path));
        }
      } else if (mode === 'move' && origin) {
        const dx = info.cell.x - anchor.x;
        const dy = info.cell.y - anchor.y;
        const { width, height } = env.doc;
        env.setPreview(null);
        if (env.layer && (dx !== 0 || dy !== 0)) {
          env.commit(
            moveSelectionEdits(env.layer.cells, origin, dx, dy, width, height),
            'Move selection',
          );
        }
        env.setSelection(translateSelection(origin, dx, dy, width, height));
      }
      mode = 'idle';
      origin = null;
      path = [];
    },
    cancel(env) {
      env.setPreview(null);
      if (mode === 'move' && origin) env.setSelection(origin);
      if (mode === 'draw') env.setSelection(base);
      mode = 'idle';
      origin = null;
      path = [];
    },
  };
}

/** Прямоугольное выделение: важны только первая и последняя ячейки пути. */
export const createSelectTool = (): Tool =>
  createSelectionTool('select', 'Select', 'm', 'cell', {
    live: rectCells,
    commit: rectCells,
    clearsOnClick: true,
  });

function rectCells(env: ToolEnv, path: readonly Point[]): Point[] {
  const corners = rectFromPoints(path[0], path[path.length - 1]);
  const rect = clampRect(corners, env.doc.width, env.doc.height);
  return rect ? [...iterateRect(rect)] : [];
}

/**
 * Лассо: во время жеста подсвечивается сама обводка, а на отпускании она замыкается и
 * заливается. Заливать на каждое движение указателя незачем — до замыкания контура
 * промежуточная фигура всё равно не та, которую рисует пользователь.
 */
export const createLassoTool = (): Tool =>
  createSelectionTool('lasso', 'Lasso', 'q', 'crosshair', {
    live: (_env, path) => [...path],
    commit: (env, path) => polygonCells(path, env.doc.width, env.doc.height),
    clearsOnClick: true,
  });

/** Волшебная палочка: смежная область по умолчанию, по всему слою — если включён несмежный режим. */
export const createWandTool = (): Tool =>
  createSelectionTool('wand', 'Magic wand', 'w', 'crosshair', {
    live: (env, path) => wandCells(env, path[path.length - 1]),
    commit: (env, path) => wandCells(env, path[path.length - 1]),
    clearsOnClick: false,
  });

function wandCells(env: ToolEnv, cell: Point): Point[] {
  if (!env.layer) return [];
  const { width, height } = env.doc;
  return env.wandContiguous
    ? floodFill(env.layer.cells, width, height, cell.x, cell.y)
    : similarCells(env.layer.cells, width, height, cell.x, cell.y);
}
