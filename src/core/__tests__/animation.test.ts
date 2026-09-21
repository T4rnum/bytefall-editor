import { describe, expect, it } from 'vitest';
import {
  MAX_FRAMES,
  addFrame,
  animationDuration,
  clampFrameIndex,
  createAnimation,
  frameDocument,
  mapFrames,
  moveFrame,
  removeFrame,
  setFrameDuration,
  withFrameDocument,
} from '../animation';
import { makeCell } from '../cell';
import { composite } from '../compositor';
import { addLayer, createDocument, createLayer, findLayer, setLayerCells } from '../document';
import { applyEdits, editsFromPoints, emptyGrid, getCell } from '../grid';
import { cellEditsEntry, liftToFrame } from '../history';
import { addObject, createObject } from '../object';

const drawn = () => {
  const doc = createDocument({ width: 4, height: 2 });
  const layerId = doc.layers[0].id;
  const cells = applyEdits(emptyGrid(), editsFromPoints([{ x: 1, y: 0 }], makeCell('#')));
  return { doc: setLayerCells(doc, layerId, cells), layerId };
};

describe('frames as documents', () => {
  it('wraps a document into one frame and projects it back unchanged', () => {
    const { doc } = drawn();
    const anim = createAnimation(doc);
    expect(anim.frames).toHaveLength(1);
    expect(frameDocument(anim, 0)).toEqual(doc);
    expect(() => frameDocument(anim, 1)).toThrow(RangeError);
  });

  it('writes a document back into its frame and the header into the animation', () => {
    const { doc } = drawn();
    const anim = addFrame(createAnimation(doc), 0, 'empty');
    const renamed = { ...frameDocument(anim, 1), name: 'Renamed' };
    const next = withFrameDocument(anim, 1, renamed);
    expect(next.name).toBe('Renamed');
    expect(frameDocument(next, 0).name).toBe('Renamed');
    expect(next.frames[0]).toBe(anim.frames[0]);
  });

  it('maps a layer operation over every frame', () => {
    const { doc } = drawn();
    const anim = addFrame(createAnimation(doc), 0, 'duplicate');
    const layer = createLayer('Second');
    const next = mapFrames(anim, (d) => addLayer(d, layer));
    expect(next.frames.every((f) => f.layers.some((l) => l.id === layer.id))).toBe(true);
  });
});

describe('frame operations', () => {
  it('duplicates frames sharing cells, creates empty frames and enforces the limit', () => {
    const { doc, layerId } = drawn();
    const base = createAnimation(doc);
    const duplicated = addFrame(base, 0, 'duplicate');
    expect(duplicated.frames).toHaveLength(2);
    expect(duplicated.frames[1].id).not.toBe(duplicated.frames[0].id);
    expect(duplicated.frames[1].layers[0].cells).toBe(duplicated.frames[0].layers[0].cells);

    const withObject = addObject(doc, createObject({ name: 'o', layerId, x: 0, y: 0 }));
    const empty = addFrame(createAnimation(withObject), 0, 'empty');
    expect(empty.frames[1].layers[0].cells.size).toBe(0);
    expect(empty.frames[1].layers[0].id).toBe(layerId);
    expect(empty.frames[1].objects).toHaveLength(0);

    let full = base;
    for (let i = 1; i < MAX_FRAMES; i++) full = addFrame(full, 0, 'empty');
    expect(() => addFrame(full, 0, 'empty')).toThrow(/At most/);
  });

  it('removes, moves and retimes frames', () => {
    const { doc } = drawn();
    let anim = createAnimation(doc);
    expect(() => removeFrame(anim, 0)).toThrow(/last frame/);
    anim = addFrame(addFrame(anim, 0, 'empty'), 1, 'empty');
    const [a, b, c] = anim.frames.map((f) => f.id);
    expect(moveFrame(anim, 2, 0).frames.map((f) => f.id)).toEqual([c, a, b]);
    expect(moveFrame(anim, 1, 1)).toBe(anim);
    expect(removeFrame(anim, 1).frames.map((f) => f.id)).toEqual([a, c]);

    const slow = setFrameDuration(anim, 0, 250);
    expect(slow.frames[0].duration).toBe(250);
    expect(setFrameDuration(anim, 0, 5).frames[0].duration).toBe(20);
    expect(setFrameDuration(anim, 0, 100)).toBe(anim);
    expect(animationDuration(slow)).toBe(450);
    expect(clampFrameIndex(anim, 9)).toBe(2);
    expect(clampFrameIndex(anim, -3)).toBe(0);
  });
});

describe('history over frames', () => {
  it('lifts a cell patch so it touches only its frame', () => {
    const { doc, layerId } = drawn();
    const anim = addFrame(createAnimation(doc), 0, 'empty');
    const entry = cellEditsEntry(
      frameDocument(anim, 1),
      layerId,
      editsFromPoints([{ x: 2, y: 1 }], makeCell('x')),
      'draw',
    )!;
    const lifted = liftToFrame(entry, 1);
    const applied = lifted.apply(anim);
    expect(getCell(findLayer(frameDocument(applied, 1), layerId)!.cells, 2, 1)?.glyph).toBe('x');
    expect(applied.frames[0]).toBe(anim.frames[0]);
    expect(lifted.revert(applied).frames[1].layers[0].cells.size).toBe(0);
    expect(lifted.apply(removeFrame(anim, 1))).toEqual(removeFrame(anim, 1));
  });
});

describe('onion skin ghosts', () => {
  it('draws ghosts translucently under the main document', () => {
    const { doc } = drawn();
    const blank = frameDocument(addFrame(createAnimation(doc), 0, 'empty'), 1);
    const buf = composite(blank, null, undefined, [{ doc, opacity: 0.4 }]);
    expect(buf.glyphs[1]).toBe('#');
    expect(buf.fg[1 * 4 + 3]).toBeCloseTo(0.4);
    const over = composite(doc, null, undefined, [{ doc, opacity: 0.4 }]);
    expect(over.fg[1 * 4 + 3]).toBe(1);
  });
});
