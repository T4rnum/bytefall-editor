import { type Affine, applyAffine } from '../../core/affine';
import type { Document } from '../../core/document';
import type { Point } from '../../core/geometry';
import { glyphQuad, placedGlyphs } from '../../core/glyphPick';
import { findObject } from '../../core/object';
import { type EditArea, areaCellAt, editArea } from '../../core/objectEdit';
import { objectMatrix } from '../../core/placement';
import type { CanvasMarks, EditMarks } from '../../render/Overlay';
import { loopSegments } from '../../render/lineMarks';
import type { EditorState } from '../store/editorStore';
import { getTool } from '../tools';

/** Точка области правки в документ: ячейки области = ячейки объекта + offset. */
const toDoc = (world: Affine, area: EditArea, x: number, y: number): Point =>
  applyAffine(world, x - area.offset.x, y - area.offset.y);

/** Линии сетки области правки, повёрнутые вместе с объектом. */
function gridLines(world: Affine, area: EditArea): Point[] {
  const out: Point[] = [];
  for (let x = 0; x <= area.width; x++) {
    out.push(toDoc(world, area, x, 0), toDoc(world, area, x, area.height));
  }
  for (let y = 0; y <= area.height; y++) {
    out.push(toDoc(world, area, 0, y), toDoc(world, area, area.width, y));
  }
  return out;
}

/** Клетка области правки четырьмя углами в документе. */
const cellQuad = (world: Affine, area: EditArea, cell: Point): Point[] => [
  toDoc(world, area, cell.x, cell.y),
  toDoc(world, area, cell.x + 1, cell.y),
  toDoc(world, area, cell.x + 1, cell.y + 1),
  toDoc(world, area, cell.x, cell.y + 1),
];

/**
 * Графика правки изнутри для оверлея. Курсор — клетка сетки объекта под указателем у рисующих
 * инструментов, а у текста с поставленным курсором — клетка ввода. null — правки нет.
 */
export function editMarks(doc: Document, editor: EditorState, time: number): EditMarks | null {
  const obj = editor.editingObjectId ? findObject(doc, editor.editingObjectId) : undefined;
  if (!obj) return null;
  const world = objectMatrix(doc, obj);
  const area = editArea(obj);
  const selected = new Set(editor.glyphSelection);
  const quads = placedGlyphs(doc, obj, time)
    .filter((g) => selected.has(g.key))
    .map((g) => glyphQuad(g.matrix));
  const typing = editor.tool === 'text' && editor.textCursor;
  const hover =
    getTool(editor.tool).drawsCells && editor.cursorPoint
      ? areaCellAt(world, area, editor.cursorPoint)
      : null;
  const cursorCell = typing ? editor.textCursor : hover;
  return {
    grid: gridLines(world, area),
    glyphs: quads,
    marquee: editor.marquee ? loopSegments([editor.marquee]) : [],
    cursor: cursorCell ? loopSegments([cellQuad(world, area, cursorCell)]) : [],
  };
}

/** Сторона ручки холста в пикселях экрана: при любом зуме её одинаково легко увидеть. */
const CANVAS_HANDLE_PX = 8;

/**
 * Рамка и ручки инструмента «Холст»: у нынешнего холста или, пока тянут край, у будущего.
 * null — инструмент не выбран.
 */
export function canvasMarks(doc: Document, editor: EditorState): CanvasMarks | null {
  if (editor.tool !== 'canvas') return null;
  const r = editor.canvasFrame ?? { x: 0, y: 0, w: doc.width, h: doc.height };
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  const mids = corners.map((p, i) => {
    const q = corners[(i + 1) % 4];
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  });
  const half = CANVAS_HANDLE_PX / 2 / editor.camera.zoom;
  const square = (p: Point): Point[] => [
    { x: p.x - half, y: p.y - half },
    { x: p.x + half, y: p.y - half },
    { x: p.x + half, y: p.y + half },
    { x: p.x - half, y: p.y + half },
  ];
  return { frame: loopSegments([corners]), handles: [...corners, ...mids].map(square) };
}

/** Изменилось ли в сторе то, от чего зависит графика правки изнутри и инструмента «Холст». */
export const marksChanged = (state: EditorState, prev: EditorState): boolean =>
  state.editingObjectId !== prev.editingObjectId ||
  state.glyphSelection !== prev.glyphSelection ||
  state.marquee !== prev.marquee ||
  state.cursorPoint !== prev.cursorPoint ||
  state.textCursor !== prev.textCursor ||
  state.tool !== prev.tool ||
  state.draft !== prev.draft ||
  state.canvasFrame !== prev.canvasFrame ||
  state.camera.zoom !== prev.camera.zoom;
