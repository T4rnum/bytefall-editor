import { describe, expect, it } from 'vitest';
import { createAnimation, frameDocument } from '../animation';
import { makeCell } from '../cell';
import { createDocument } from '../document';
import { applyEdits, emptyGrid, keyOf } from '../grid';
import { addObject, createObject, setObjectProp } from '../object';
import {
  DocumentFormatError,
  FORMAT_VERSION,
  deserialize,
  serialize,
  toFileObject,
} from '../serialization';

const sampleDoc = () => {
  const doc = createDocument({ width: 8, height: 4, name: 'Objects' });
  const layerId = doc.layers[0].id;
  const cells = applyEdits(
    emptyGrid(),
    new Map([[keyOf(0, 0), makeCell('@', '#ff0000', '#000000')]]),
  );
  const obj = createObject({ name: 'Hero', layerId, x: -1, y: 2, cells });
  return setObjectProp(addObject(doc, obj), obj.id, 'hp', 10);
};

const sample = () => createAnimation(sampleDoc());

describe('serialization with objects', () => {
  it('writes the current version and round-trips objects with props', () => {
    const anim = sample();
    const file = toFileObject(anim);
    expect(file.version).toBe(FORMAT_VERSION);
    expect(file.frames?.[0].objects?.[0]).toMatchObject({
      name: 'Hero',
      transform: { x: -1, y: 2 },
      props: { hp: 10 },
    });
    expect(deserialize(serialize(anim))).toEqual(anim);
  });

  it('reads version 2 files with objects as one frame', () => {
    const doc = sampleDoc();
    const file = toFileObject(createAnimation(doc));
    // До версии 5 позиция лежала прямо в объекте, трансформа не было.
    const objects = file.frames![0].objects!.map(({ transform, ...rest }) => ({
      ...rest,
      x: transform!.x,
      y: transform!.y,
    }));
    const legacy = {
      ...file,
      version: 2 as const,
      frames: undefined,
      layers: file.frames![0].layers,
      objects,
    };
    expect(frameDocument(deserialize(JSON.stringify(legacy)), 0)).toEqual(doc);
  });

  it('rejects objects with unknown layers, duplicate ids or far positions', () => {
    const file = toFileObject(sample());
    const frame = file.frames![0];
    const object = frame.objects![0];
    const withObjects = (objects: typeof frame.objects) => ({
      ...file,
      frames: [{ ...frame, objects }],
    });
    expect(() =>
      deserialize(JSON.stringify(withObjects([{ ...object, layerId: 'nope' }]))),
    ).toThrow(/unknown layer/);
    expect(() => deserialize(JSON.stringify(withObjects([object, object])))).toThrow(
      DocumentFormatError,
    );
    const far = { ...object, transform: { ...object.transform!, x: 5000 } };
    expect(() => deserialize(JSON.stringify(withObjects([far])))).toThrow(
      /objects\.0\.transform\.x/,
    );
    const dupFrame = { ...file, frames: [frame, frame] };
    expect(() => deserialize(JSON.stringify(dupFrame))).toThrow(/Duplicate frame id/);
  });
});
