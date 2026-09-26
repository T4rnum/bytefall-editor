import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { keyOf } from '../../../core/grid';
import { placedGlyphs } from '../../../core/glyphPick';
import { addObject, createObject, findObject } from '../../../core/object';
import { getTool } from '../../tools';
import { buildToolEnv } from '../../tools/env';
import { toolPointer } from '../../tools/editSession';
import { useDocumentStore } from '../documentStore';
import { useEditorStore } from '../editorStore';
import { deleteSelectionAction, selectAllAction } from '../clipboardActions';
import {
  deleteSelectedGlyphsAction,
  escapeEditAction,
  toggleEditModeAction,
} from '../objectEditActions';

const state = () => useDocumentStore.getState();
const editor = () => useEditorStore.getState();
const object = () => findObject(state().doc, 'o')!;

/** Строка «ABC» в (4, 2), без поворота; второй объект «other» рядом. */
function setup() {
  let doc = createDocument({ width: 16, height: 8 });
  const layerId = doc.layers[0].id;
  const cells = new Map([...'ABC'].map((ch, x) => [keyOf(x, 0), makeCell(ch)]));
  doc = addObject(doc, createObject({ name: 'o', id: 'o', layerId, x: 4, y: 2, cells }));
  doc = addObject(doc, createObject({ name: 'other', id: 'other', layerId, x: 10, y: 5 }));
  state().replaceAnimation(createAnimation(doc));
  useEditorStore.setState({
    tool: 'pencil',
    selection: null,
    textCursor: null,
    draft: null,
    editingObjectId: null,
    glyphSelection: [],
  });
  editor().setSelectedObject('o');
}

/** Указатель в центре ячейки документа, как его дал бы вьюпорт. */
const at = (x: number, y: number, keys: { shift?: boolean; alt?: boolean } = {}) => ({
  cell: { x, y },
  point: { x: x + 0.5, y: y + 0.5 },
  button: 0,
  shift: keys.shift ?? false,
  alt: keys.alt ?? false,
});

/** Жест инструмента от ячейки до ячейки документа, через тот же путь, что у вьюпорта. */
function drag(from: [number, number], to: [number, number], keys = {}) {
  const tool = getTool(editor().tool);
  const step = (fn: 'onPointerDown' | 'onPointerMove' | 'onPointerUp', x: number, y: number) => {
    const env = buildToolEnv();
    tool[fn]?.(env, toolPointer(tool, env, at(x, y, keys)));
  };
  step('onPointerDown', ...from);
  step('onPointerMove', ...to);
  step('onPointerUp', ...to);
}

describe('правка объекта изнутри', () => {
  beforeEach(setup);

  it('Tab входит и выходит, смена выбранного объекта тоже выходит', () => {
    toggleEditModeAction();
    expect(editor().editingObjectId).toBe('o');
    toggleEditModeAction();
    expect(editor().editingObjectId).toBeNull();
    toggleEditModeAction();
    editor().setSelectedObject('other');
    expect(editor().editingObjectId).toBeNull();
  });

  it('карандаш рисует в сетке объекта, левее начала — со сдвигом начала', () => {
    toggleEditModeAction();
    // Ячейка документа (2, 2) — две клетки левее «A».
    drag([2, 2], [2, 2]);
    expect(object().transform).toMatchObject({ x: 2, y: 2 });
    expect([...object().cells.keys()].sort((a, b) => a - b)).toEqual([
      keyOf(0, 0),
      keyOf(2, 0),
      keyOf(3, 0),
      keyOf(4, 0),
    ]);
    // Одна запись истории на всё, и отмена возвращает начало на место.
    state().undo();
    expect(object().transform).toMatchObject({ x: 4, y: 2 });
    expect(object().cells.size).toBe(3);
  });

  it('рамка ловит символы по центрам, выделенные ограничивают кисть', () => {
    toggleEditModeAction();
    editor().setTool('select');
    drag([4, 1], [5, 3]);
    expect(editor().glyphSelection).toEqual([keyOf(0, 0), keyOf(1, 0)]);
    editor().setTool('pencil');
    drag([4, 2], [7, 2]);
    // «C» не выделен и не тронут, клетки правее тоже.
    expect(object().cells.get(keyOf(2, 0))?.glyph).toBe('C');
    expect(object().cells.get(keyOf(0, 0))?.glyph).toBe('#');
    expect(object().cells.size).toBe(3);
  });

  it('щелчок выбирает символ, Shift добавляет, перетаскивание двигает выделенные', () => {
    toggleEditModeAction();
    editor().setTool('select');
    drag([4, 2], [4, 2]);
    drag([6, 2], [6, 2], { shift: true });
    expect(editor().glyphSelection).toEqual([keyOf(0, 0), keyOf(2, 0)]);
    drag([6, 2], [6, 3]);
    expect(object().cells.get(keyOf(0, 1))?.glyph).toBe('A');
    expect(object().cells.get(keyOf(2, 1))?.glyph).toBe('C');
    expect(editor().glyphSelection).toEqual([keyOf(0, 1), keyOf(2, 1)]);
  });

  it('Ctrl+A, Delete и Escape работают по символам, а не по холсту', () => {
    toggleEditModeAction();
    selectAllAction();
    expect(editor().glyphSelection).toHaveLength(3);
    expect(editor().selection).toBeNull();
    editor().setGlyphSelection([keyOf(1, 0)]);
    deleteSelectionAction();
    expect(object().cells.has(keyOf(1, 0))).toBe(false);
    expect(findObject(state().doc, 'o')).toBeDefined();
    expect(deleteSelectedGlyphsAction()).toBe(true);
    editor().setGlyphSelection([keyOf(0, 0)]);
    escapeEditAction();
    expect(editor().glyphSelection).toEqual([]);
    expect(editor().editingObjectId).toBe('o');
    escapeEditAction();
    expect(editor().editingObjectId).toBeNull();
    expect(editor().selectedObjectId).toBe('o');
  });

  it('символы в правке считаются там, где их видно', () => {
    const placed = placedGlyphs(state().doc, object(), 0);
    expect(placed.map((g) => [g.matrix.e, g.matrix.f])).toEqual([
      [4.5, 2.5],
      [5.5, 2.5],
      [6.5, 2.5],
    ]);
  });
});
