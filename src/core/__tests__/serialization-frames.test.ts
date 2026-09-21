import { describe, expect, it } from 'vitest';
import { addFrame, createAnimation } from '../animation';
import { createDocument } from '../document';
import { DocumentFormatError, deserialize, toFileObject } from '../serialization';

describe('frames in files', () => {
  it('round-trips several frames with their durations', () => {
    const anim = addFrame(createAnimation(createDocument({ width: 4, height: 4 })), 0, 'empty');
    const file = toFileObject(anim);
    file.frames![1].duration = 400;
    const restored = deserialize(JSON.stringify(file));
    expect(restored.frames.map((f) => f.duration)).toEqual([100, 400]);
    expect(restored.frames[1].layers[0].id).toBe(anim.frames[0].layers[0].id);
  });

  it('rejects frames whose layers differ from the first frame', () => {
    const anim = addFrame(createAnimation(createDocument({ width: 4, height: 4 })), 0, 'empty');
    const file = toFileObject(anim);
    const extra = { ...file.frames![1].layers[0], id: 'other-layer' };
    file.frames![1].layers.push(extra);
    expect(() => deserialize(JSON.stringify(file))).toThrow(DocumentFormatError);
    expect(() => deserialize(JSON.stringify(file))).toThrow(/different layers/);

    const reordered = toFileObject(anim);
    reordered.frames![0].layers[0].id = 'renamed';
    expect(() => deserialize(JSON.stringify(reordered))).toThrow(/different layers/);
  });
});
