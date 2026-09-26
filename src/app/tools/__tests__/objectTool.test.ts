import { describe, expect, it } from 'vitest';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { applyEdits, emptyGrid, keyOf } from '../../../core/grid';
import { addObject, createObject, findObject } from '../../../core/object';
import { createObjectTool } from '../objectTool';
import { at, makeToolEnv } from './testEnv';

const setup = (locked = false) => {
  const doc = createDocument({ width: 10, height: 10 });
  const layerId = doc.layers[0].id;
  const cells = applyEdits(emptyGrid(), new Map([[keyOf(0, 0), makeCell('#')]]));
  const obj = { ...createObject({ name: 'o', layerId, x: 2, y: 2, cells }), locked };
  return { doc: addObject(doc, obj), id: obj.id };
};

const key = (name: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({
    key: name,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...extra,
  }) as KeyboardEvent;

describe('object tool pointer', () => {
  it('selects, previews the drag through a draft and commits the move once', () => {
    const { doc, id } = setup();
    const { env, calls } = makeToolEnv(doc);
    const tool = createObjectTool();
    tool.onPointerDown?.(env, at(2, 2));
    expect(calls.selected).toEqual([id]);
    tool.onPointerMove?.(env, at(4, 3));
    expect(findObject(calls.draft!, id)).toMatchObject({ transform: { x: 4, y: 3 } });
    tool.onPointerUp?.(env, at(4, 3));
    expect(calls.draft).toBeNull();
    expect(calls.docCommits).toHaveLength(1);
    expect(calls.docCommits[0].label).toBe('Move object');
    expect(findObject(calls.docCommits[0].doc, id)).toMatchObject({ transform: { x: 4, y: 3 } });
  });

  it('deselects on empty clicks and never moves locked objects', () => {
    const { doc, id } = setup(true);
    const { env, calls } = makeToolEnv(doc);
    const tool = createObjectTool();
    tool.onPointerDown?.(env, at(8, 8));
    expect(calls.selected).toEqual([null]);
    tool.onPointerDown?.(env, at(2, 2));
    tool.onPointerMove?.(env, at(5, 5));
    tool.onPointerUp?.(env, at(5, 5));
    expect(calls.selected).toEqual([null, id]);
    expect(calls.draft).toBeNull();
    expect(calls.docCommits).toHaveLength(0);
  });
});

describe('object tool cancel', () => {
  it('cancels a drag on Escape without committing and keeps the selection', () => {
    const { doc, id } = setup();
    const { env, calls } = makeToolEnv(doc, { selectedObjectId: id });
    const tool = createObjectTool();
    tool.onPointerDown?.(env, at(2, 2));
    tool.onPointerMove?.(env, at(6, 6));
    expect(calls.draft).not.toBeNull();
    expect(tool.onKeyDown?.(env, key('Escape'))).toBe(true);
    expect(calls.draft).toBeNull();
    tool.onPointerUp?.(env, at(6, 6));
    expect(calls.docCommits).toHaveLength(0);
    expect(calls.selected).toEqual([id]);
  });
});

describe('object tool keyboard', () => {
  it('nudges and deselects the selected object; Delete is left to the shared action', () => {
    const { doc, id } = setup();
    const { env, calls } = makeToolEnv(doc, { selectedObjectId: id });
    const tool = createObjectTool();
    expect(tool.onKeyDown?.(env, key('ArrowRight'))).toBe(true);
    expect(findObject(calls.docCommits[0].doc, id)).toMatchObject({ transform: { x: 3, y: 2 } });
    expect(tool.onKeyDown?.(env, key('ArrowDown', { shiftKey: true }))).toBe(true);
    expect(findObject(calls.docCommits[1].doc, id)).toMatchObject({ transform: { x: 2, y: 12 } });
    expect(tool.onKeyDown?.(env, key('ArrowRight', { ctrlKey: true }))).toBe(false);
    // Delete удаляет объект при любом инструменте: это общее действие, а не инструмента.
    expect(tool.onKeyDown?.(env, key('Delete'))).toBe(false);
    expect(tool.onKeyDown?.(env, key('Escape'))).toBe(true);
    expect(calls.selected).toEqual([null]);
    expect(tool.onKeyDown?.(makeToolEnv(doc).env, key('ArrowRight'))).toBe(false);
  });
});
