import { describe, expect, it } from 'vitest';
import { makeCell } from '../../../core/cell';
import { type Document, createDocument } from '../../../core/document';
import { applyEdits, emptyGrid, keyOf } from '../../../core/grid';
import { addObject, createObject, findObject } from '../../../core/object';
import { createObjectTool } from '../objectTool';
import type { ToolEnv } from '../types';

interface Calls {
  draft: Document | null;
  commits: { label: string; doc: Document }[];
  selected: (string | null)[];
}

function makeEnv(
  doc: Document,
  selectedObjectId: string | null = null,
): { env: ToolEnv; calls: Calls } {
  const calls: Calls = { draft: null, commits: [], selected: [] };
  const noop = (): void => undefined;
  const env: ToolEnv = {
    doc,
    layer: doc.layers[0],
    brush: makeCell('#'),
    shapeFill: false,
    selection: null,
    textCursor: null,
    selectedObjectId,
    setPreview: noop,
    commit: noop,
    setSelection: noop,
    pick: noop,
    setTextCursor: noop,
    setSelectedObject: (id) => calls.selected.push(id),
    setDraft: (draft) => {
      calls.draft = draft;
    },
    commitDocument: (label, next) => calls.commits.push({ label, doc: next }),
  };
  return { env, calls };
}

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
    const { env, calls } = makeEnv(doc);
    const tool = createObjectTool();
    tool.onPointerDown?.(env, { cell: { x: 2, y: 2 }, button: 0, shift: false });
    expect(calls.selected).toEqual([id]);
    tool.onPointerMove?.(env, { cell: { x: 4, y: 3 }, button: 0, shift: false });
    expect(findObject(calls.draft!, id)).toMatchObject({ x: 4, y: 3 });
    tool.onPointerUp?.(env, { cell: { x: 4, y: 3 }, button: 0, shift: false });
    expect(calls.draft).toBeNull();
    expect(calls.commits).toHaveLength(1);
    expect(calls.commits[0].label).toBe('Move object');
    expect(findObject(calls.commits[0].doc, id)).toMatchObject({ x: 4, y: 3 });
  });

  it('deselects on empty clicks and never moves locked objects', () => {
    const { doc, id } = setup(true);
    const { env, calls } = makeEnv(doc);
    const tool = createObjectTool();
    tool.onPointerDown?.(env, { cell: { x: 8, y: 8 }, button: 0, shift: false });
    expect(calls.selected).toEqual([null]);
    tool.onPointerDown?.(env, { cell: { x: 2, y: 2 }, button: 0, shift: false });
    tool.onPointerMove?.(env, { cell: { x: 5, y: 5 }, button: 0, shift: false });
    tool.onPointerUp?.(env, { cell: { x: 5, y: 5 }, button: 0, shift: false });
    expect(calls.selected).toEqual([null, id]);
    expect(calls.draft).toBeNull();
    expect(calls.commits).toHaveLength(0);
  });
});

describe('object tool cancel', () => {
  it('cancels a drag on Escape without committing and keeps the selection', () => {
    const { doc, id } = setup();
    const { env, calls } = makeEnv(doc, id);
    const tool = createObjectTool();
    tool.onPointerDown?.(env, { cell: { x: 2, y: 2 }, button: 0, shift: false });
    tool.onPointerMove?.(env, { cell: { x: 6, y: 6 }, button: 0, shift: false });
    expect(calls.draft).not.toBeNull();
    expect(tool.onKeyDown?.(env, key('Escape'))).toBe(true);
    expect(calls.draft).toBeNull();
    tool.onPointerUp?.(env, { cell: { x: 6, y: 6 }, button: 0, shift: false });
    expect(calls.commits).toHaveLength(0);
    expect(calls.selected).toEqual([id]);
  });
});

describe('object tool keyboard', () => {
  it('nudges, deletes and deselects the selected object', () => {
    const { doc, id } = setup();
    const { env, calls } = makeEnv(doc, id);
    const tool = createObjectTool();
    expect(tool.onKeyDown?.(env, key('ArrowRight'))).toBe(true);
    expect(findObject(calls.commits[0].doc, id)).toMatchObject({ x: 3, y: 2 });
    expect(tool.onKeyDown?.(env, key('ArrowDown', { shiftKey: true }))).toBe(true);
    expect(findObject(calls.commits[1].doc, id)).toMatchObject({ x: 2, y: 12 });
    expect(tool.onKeyDown?.(env, key('ArrowRight', { ctrlKey: true }))).toBe(false);
    expect(tool.onKeyDown?.(env, key('Delete'))).toBe(true);
    expect(findObject(calls.commits[2].doc, id)).toBeUndefined();
    expect(tool.onKeyDown?.(env, key('Escape'))).toBe(true);
    expect(calls.selected).toEqual([null, null]);
    expect(tool.onKeyDown?.(makeEnv(doc).env, key('ArrowRight'))).toBe(false);
  });
});
