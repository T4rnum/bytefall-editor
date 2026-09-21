import { describe, expect, it } from 'vitest';
import { createAnimation } from '../animation';
import { createDocument, updateLayer } from '../document';
import { createEffect } from '../effects';
import { FORMAT_VERSION, deserialize, serialize, toFileObject } from '../serialization';

const sample = () => {
  const doc = createDocument({ width: 4, height: 4 });
  const layerId = doc.layers[0].id;
  const effects = [
    createEffect('fire', 'fx-1'),
    { ...createEffect('scroll', 'fx-2'), enabled: false },
  ];
  return createAnimation(updateLayer(doc, layerId, { effects }));
};

describe('layer effects in files', () => {
  it('writes version 4 and round-trips effects', () => {
    const anim = sample();
    const file = toFileObject(anim);
    expect(file.version).toBe(FORMAT_VERSION);
    expect(file.frames![0].layers[0].effects).toHaveLength(2);
    expect(deserialize(serialize(anim))).toEqual(anim);
  });

  it('reads layers without effects and rejects bad parameters', () => {
    const file = toFileObject(createAnimation(createDocument({ width: 2, height: 2 })));
    expect(file.frames![0].layers[0].effects).toBeUndefined();
    expect(deserialize(JSON.stringify(file)).frames[0].layers[0].effects).toEqual([]);

    const bad = toFileObject(sample());
    const fire = bad.frames![0].layers[0].effects![0];
    if (fire.kind === 'fire') fire.height = 999;
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/height/);

    const unknown = toFileObject(sample());
    (unknown.frames![0].layers[0].effects![0] as { kind: string }).kind = 'plasma';
    expect(() => deserialize(JSON.stringify(unknown))).toThrow(/effects/);

    const tooMany = toFileObject(sample());
    const list = tooMany.frames![0].layers[0].effects!;
    for (let i = 0; i < 10; i++) list.push({ ...createEffect('pulse', `extra-${i}`) });
    expect(() => deserialize(JSON.stringify(tooMany))).toThrow(/effects/);
  });
});
