import { beforeEach, describe, expect, it } from 'vitest';
import { addFrame, createAnimation, moveFrame, removeFrame } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { editsFromPoints, getCell } from '../../../core/grid';
import { useDocumentStore } from '../documentStore';

const reset = (): void => {
  useDocumentStore
    .getState()
    .replaceAnimation(createAnimation(createDocument({ width: 6, height: 4 })));
};

describe('document store frames and history', () => {
  beforeEach(reset);

  it('returns to the frame a change was made on after undo and redo', () => {
    const store = useDocumentStore.getState();
    store.commitAnimation('New frame', addFrame(store.animation, 0, 'empty'), 1);
    expect(useDocumentStore.getState().frameIndex).toBe(1);
    const layerId = useDocumentStore.getState().doc.layers[0].id;
    useDocumentStore
      .getState()
      .commitCells(layerId, editsFromPoints([{ x: 1, y: 1 }], makeCell('#')), 'draw');
    useDocumentStore.getState().setFrameIndex(0);

    useDocumentStore.getState().undo();
    const afterUndo = useDocumentStore.getState();
    expect(afterUndo.frameIndex).toBe(1);
    expect(afterUndo.animation.frames[1].layers[0].cells.size).toBe(0);

    useDocumentStore.getState().redo();
    expect(getCell(useDocumentStore.getState().doc.layers[0].cells, 1, 1)?.glyph).toBe('#');
  });

  it('restores the deleted frame under the cursor and follows moved frames', () => {
    const store = useDocumentStore.getState();
    let anim = addFrame(addFrame(store.animation, 0, 'empty'), 1, 'empty');
    store.commitAnimation('Frames', anim, 2);
    anim = useDocumentStore.getState().animation;
    const lastId = anim.frames[2].id;

    // Указатель остаётся на месте, если кадр не назван: соседний кадр выбирает действие.
    useDocumentStore.getState().commitAnimation('Delete frame', removeFrame(anim, 2), 1);
    expect(useDocumentStore.getState().frameIndex).toBe(1);
    useDocumentStore.getState().undo();
    const restored = useDocumentStore.getState();
    expect(restored.frameIndex).toBe(2);
    expect(restored.animation.frames[2].id).toBe(lastId);

    useDocumentStore.getState().commitAnimation('Move', moveFrame(restored.animation, 2, 0), 0);
    expect(useDocumentStore.getState().animation.frames[0].id).toBe(lastId);
    expect(useDocumentStore.getState().frameIndex).toBe(0);
    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().frameIndex).toBe(2);
  });

  it('marks the document dirty only until the saved snapshot is current', () => {
    const store = useDocumentStore.getState();
    expect(store.dirty).toBe(false);
    store.commitAnimation('New frame', addFrame(store.animation, 0, 'duplicate'));
    const saved = useDocumentStore.getState().animation;
    useDocumentStore.getState().markSaved({ name: 'a.bp.json', handle: null }, saved);
    expect(useDocumentStore.getState().dirty).toBe(false);
    useDocumentStore.getState().setFrameIndex(1);
    expect(useDocumentStore.getState().dirty).toBe(false);
  });
});
