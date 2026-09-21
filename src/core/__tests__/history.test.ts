import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { createDocument, findLayer, resizeDocument } from '../document';
import { editsFromPoints, getCell } from '../grid';
import {
  canRedo,
  canUndo,
  cellEditsEntry,
  createHistory,
  pushEntry,
  redo,
  snapshotEntry,
  undo,
} from '../history';

const setup = () => {
  const doc = createDocument({ width: 8, height: 8 });
  return { doc, layerId: doc.layers[0].id };
};

describe('cellEditsEntry', () => {
  it('returns null when nothing changes or layer is missing', () => {
    const { doc, layerId } = setup();
    const clear = editsFromPoints([{ x: 0, y: 0 }], null);
    expect(cellEditsEntry(doc, layerId, clear, 'noop')).toBeNull();
    const draw = editsFromPoints([{ x: 0, y: 0 }], makeCell('#'));
    expect(cellEditsEntry(doc, 'missing', draw, 'x')).toBeNull();
  });

  it('applies and reverts edits, tolerating a vanished layer', () => {
    const { doc, layerId } = setup();
    const draw = editsFromPoints([{ x: 1, y: 1 }], makeCell('#'));
    const entry = cellEditsEntry(doc, layerId, draw, 'draw');
    expect(entry).not.toBeNull();
    const applied = entry!.apply(doc);
    expect(getCell(findLayer(applied, layerId)!.cells, 1, 1)?.glyph).toBe('#');
    const reverted = entry!.revert(applied);
    expect(findLayer(reverted, layerId)!.cells.size).toBe(0);
    const other = createDocument();
    expect(entry!.apply(other)).toBe(other);
  });
});

describe('undo / redo', () => {
  it('walks back and forth and clears future on new entries', () => {
    const { doc, layerId } = setup();
    let history = createHistory();
    const first = cellEditsEntry(
      doc,
      layerId,
      editsFromPoints([{ x: 0, y: 0 }], makeCell('a')),
      'a',
    )!;
    let current = first.apply(doc);
    history = pushEntry(history, first);
    const second = cellEditsEntry(
      current,
      layerId,
      editsFromPoints([{ x: 1, y: 0 }], makeCell('b')),
      'b',
    )!;
    current = second.apply(current);
    history = pushEntry(history, second);
    expect(canUndo(history)).toBe(true);
    expect(canRedo(history)).toBe(false);

    const undone = undo(history, current)!;
    expect(findLayer(undone.doc, layerId)!.cells.size).toBe(1);
    const redone = redo(undone.history, undone.doc)!;
    expect(findLayer(redone.doc, layerId)!.cells.size).toBe(2);
    expect(redo(redone.history, redone.doc)).toBeNull();

    const branched = undo(redone.history, redone.doc)!;
    const third = snapshotEntry('resize', branched.doc, resizeDocument(branched.doc, 4, 4));
    const afterBranch = pushEntry(branched.history, third);
    expect(canRedo(afterBranch)).toBe(false);
    expect(third.apply(branched.doc).width).toBe(4);
    expect(undo(createHistory(), doc)).toBeNull();
  });

  it('respects the entry limit', () => {
    let history = createHistory(2);
    const { doc } = setup();
    for (let i = 0; i < 5; i++) history = pushEntry(history, snapshotEntry(`s${i}`, doc, doc));
    expect(history.past.map((e) => e.label)).toEqual(['s3', 's4']);
  });
});
