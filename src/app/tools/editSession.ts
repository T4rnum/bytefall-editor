import type { Document } from '../../core/document';
import { type PlacedGlyph, placedGlyphs } from '../../core/glyphPick';
import type { Cell } from '../../core/cell';
import { type CellEdits, type CellKey, keyOf, xOf, yOf } from '../../core/grid';
import { findObject, canEditObject } from '../../core/object';
import {
  type EditArea,
  applyLocalEdits,
  areaCellAt,
  areaCells,
  areaToLocal,
  editArea,
  localEdits,
  moveGlyphs,
  moveShift,
  neededShift,
} from '../../core/objectEdit';
import { objectMatrix } from '../../core/placement';
import type { EditorState } from '../store/editorStore';
import { commitObjectChange, previewObjectChange } from '../store/objectEditActions';
import type { DrawTarget, EditSession, PointerInfo, Tool, ToolEnv } from './types';

/**
 * Правка изнутри для окружения инструментов: сетка рисования — область правки объекта, превью —
 * черновик документа, коммит — через сдвиг начала, если штрих ушёл левее или выше.
 */
export interface EditContext {
  readonly session: EditSession;
  readonly target: DrawTarget;
  /** Правки инструмента: только по выделенным символам, если они есть. */
  clip(edits: CellEdits): CellEdits;
  preview(edits: CellEdits | null): void;
  commit(edits: CellEdits, label: string): void;
}

export function buildEditContext(
  doc: Document,
  editor: EditorState,
  time: number,
): EditContext | null {
  const id = editor.editingObjectId;
  const object = id ? findObject(doc, id) : undefined;
  if (!object || !canEditObject(doc, object)) return null;
  const area: EditArea = editArea(object);
  const world = objectMatrix(doc, object);
  const glyphs = editor.glyphSelection.filter((k) => object.cells.has(k));
  let placed: readonly PlacedGlyph[] | null = null;

  const selected = new Set(glyphs);
  const clip = (edits: CellEdits): CellEdits => {
    if (selected.size === 0) return edits;
    const out = new Map<CellKey, Cell | null>();
    for (const [key, cell] of edits) {
      const { x, y } = areaToLocal(area, key);
      if (x >= 0 && y >= 0 && selected.has(keyOf(x, y))) out.set(key, cell);
    }
    return out;
  };

  const moveChange = (dx: number, dy: number) => {
    const d = { x: dx, y: dy };
    return {
      shift: moveShift(glyphs, d),
      change: (next: Document, s: { x: number; y: number }) =>
        moveGlyphs(next, object.id, glyphs, d, s),
    };
  };

  const session: EditSession = {
    object,
    area,
    placed: () => (placed ??= placedGlyphs(doc, object, time)),
    glyphs,
    setGlyphs: editor.setGlyphSelection,
    setMarquee: editor.setMarquee,
    cellAt: (point) => areaCellAt(world, area, point),
    previewMove(dx, dy) {
      const { shift, change } = moveChange(dx, dy);
      editor.setDraft(dx === 0 && dy === 0 ? null : previewObjectChange(object.id, shift, change));
    },
    commitMove(dx, dy) {
      editor.setDraft(null);
      if (dx === 0 && dy === 0) return;
      const { shift, change } = moveChange(dx, dy);
      const moved = glyphs.map((k) => ({ x: xOf(k) + dx, y: yOf(k) + dy }));
      commitObjectChange(object.id, 'Move glyphs', shift, change, moved);
    },
  };

  const localChange = (edits: CellEdits) => {
    const local = localEdits(area, edits);
    return {
      shift: neededShift(local),
      change: (next: Document, s: { x: number; y: number }) =>
        applyLocalEdits(next, object.id, local, s),
    };
  };

  return {
    session,
    target: { cells: areaCells(object, area), width: area.width, height: area.height },
    clip,
    preview(edits) {
      if (!edits) {
        editor.setDraft(null);
        return;
      }
      const { shift, change } = localChange(clip(edits));
      editor.setDraft(previewObjectChange(object.id, shift, change));
    },
    commit(edits, label) {
      editor.setDraft(null);
      const clipped = clip(edits);
      if (clipped.size === 0) return;
      const { shift, change } = localChange(clipped);
      commitObjectChange(object.id, label, shift, change);
    },
  };
}

/**
 * Указатель для инструмента: рисующий инструмент в правке изнутри получает ячейку области правки
 * объекта, остальные — ячейку холста, как всегда.
 */
export function toolPointer(tool: Tool, env: ToolEnv, info: PointerInfo): PointerInfo {
  if (!tool.drawsCells || !env.editing) return info;
  const cell = env.editing.cellAt(info.point);
  return cell ? { ...info, cell } : info;
}
