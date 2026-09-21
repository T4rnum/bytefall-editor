import { describe, expect, it } from 'vitest';
import { createAnimation, frameDocument } from '../animation';
import { makeCell } from '../cell';
import { addLayer, createDocument, createLayer, setLayerCells } from '../document';
import { applyEdits, emptyGrid, getCell, keyOf } from '../grid';
import {
  DocumentFormatError,
  FORMAT_NAME,
  deserialize,
  serialize,
  toFileObject,
} from '../serialization';

const sampleDoc = () => {
  let doc = createDocument({ width: 8, height: 4, name: 'Test' });
  const id = doc.layers[0].id;
  const cells = applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), makeCell('a', '#ff0000', '#000000', { glow: 2 })],
      [keyOf(3, 1), makeCell('b', '#00ff00')],
    ]),
  );
  doc = setLayerCells(doc, id, cells);
  return addLayer(doc, { ...createLayer('Top'), opacity: 0.5, locked: true });
};

const sample = () => createAnimation(sampleDoc());

describe('serialize / deserialize', () => {
  it('round-trips an animation and its frame document', () => {
    const anim = sample();
    const restored = deserialize(serialize(anim));
    expect(restored).toEqual(anim);
    expect(frameDocument(restored, 0)).toEqual(frameDocument(anim, 0));
    expect(getCell(restored.frames[0].layers[0].cells, 3, 1)?.glyph).toBe('b');
    expect(toFileObject(anim).frames?.[0].layers[0].cells[0]).toEqual({
      x: 0,
      y: 0,
      g: 'a',
      f: '#ff0000',
      b: '#000000',
      a: { glow: 2 },
    });
  });

  it('drops cells outside of the canvas', () => {
    const file = toFileObject(sample());
    file.frames![0].layers[0].cells.push({ x: 100, y: 0, g: 'z', f: '#ffffff' });
    expect(deserialize(JSON.stringify(file)).frames[0].layers[0].cells.size).toBe(2);
  });

  it('rejects malformed input with a readable error', () => {
    expect(() => deserialize('{')).toThrow(DocumentFormatError);
    expect(() => deserialize('{"format":"other"}')).toThrow(/Invalid document at format/);
    expect(() => deserialize('[]')).toThrow(DocumentFormatError);
    const file = toFileObject(sample());
    file.frames![0].layers[0].cells[0].f = 'red';
    expect(() => deserialize(JSON.stringify(file))).toThrow(/hex color/);
    const dup = toFileObject(sample());
    dup.frames![0].layers[1].id = dup.frames![0].layers[0].id;
    expect(() => deserialize(JSON.stringify(dup))).toThrow(/Duplicate layer id/);
    const big = toFileObject(sample());
    big.width = 5000;
    expect(() => deserialize(JSON.stringify(big))).toThrow(/width/);
    const noContent = { ...toFileObject(sample()), frames: undefined };
    expect(() => deserialize(JSON.stringify(noContent))).toThrow(/neither frames nor layers/);
  });

  it('enforces size limits that protect against crafted files', () => {
    const tooManyLayers = toFileObject(sample());
    const layers = tooManyLayers.frames![0].layers;
    for (let i = 0; i < 300; i++) layers.push({ ...layers[1], id: `extra-${i}`, cells: [] });
    expect(() => deserialize(JSON.stringify(tooManyLayers))).toThrow(/layers/);

    const longName = toFileObject(sample());
    longName.name = 'x'.repeat(500);
    expect(() => deserialize(JSON.stringify(longName))).toThrow(/name/);

    const farCell = toFileObject(sample());
    farCell.frames![0].layers[0].cells.push({ x: 99999, y: 0, g: 'z', f: '#ffffff' });
    expect(() => deserialize(JSON.stringify(farCell))).toThrow(/cells\.2\.x/);

    const manyAttrs = toFileObject(sample());
    const attrs: Record<string, number> = {};
    for (let i = 0; i < 40; i++) attrs[`k${i}`] = i;
    manyAttrs.frames![0].layers[0].cells[0].a = attrs;
    expect(() => deserialize(JSON.stringify(manyAttrs))).toThrow(/attrs/);

    const slowFrame = toFileObject(sample());
    slowFrame.frames![0].duration = 999999;
    expect(() => deserialize(JSON.stringify(slowFrame))).toThrow(/duration/);
  });

  it('reads version 1 and 2 files as a single frame', () => {
    const doc = sampleDoc();
    const file = toFileObject(createAnimation(doc));
    const legacy = {
      ...file,
      version: 2 as const,
      frames: undefined,
      layers: file.frames![0].layers,
      objects: [],
    };
    const restored = deserialize(JSON.stringify(legacy));
    expect(restored.frames).toHaveLength(1);
    expect(restored.frames[0].duration).toBe(100);
    expect(frameDocument(restored, 0)).toEqual(doc);
  });

  it('reads files written under the old BlendPhoto format name', () => {
    const anim = sample();
    const file = { ...toFileObject(anim), format: 'blendphoto' as const };
    expect(deserialize(JSON.stringify(file))).toEqual(anim);
  });

  it('writes the current format name', () => {
    expect(toFileObject(sample()).format).toBe(FORMAT_NAME);
    expect(() =>
      deserialize(JSON.stringify({ ...toFileObject(sample()), format: 'nope' })),
    ).toThrow(DocumentFormatError);
  });
});
