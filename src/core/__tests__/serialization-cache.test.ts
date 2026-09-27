import { describe, expect, it } from 'vitest';
import { createAnimation, mapFrames } from '../animation';
import { makeCell } from '../cell';
import { createDocument } from '../document';
import { applyEdits, keyOf } from '../grid';
import { deserialize, serialize, toFileObject } from '../serialization';
import v11 from './fixtures/v11-scene3d.bp.json?raw';
import v9 from './fixtures/v9-rig.bp.json?raw';

/** Документ с растром и объектом, чтобы в файле были обе сетки ячеек. */
function sample() {
  const doc = createDocument({ width: 8, height: 4 });
  const cells = new Map([
    [keyOf(1, 1), makeCell('@', '#ff0000', null)],
    [keyOf(2, 1), makeCell('#', '#00ff00', '#000000')],
  ]);
  return createAnimation({ ...doc, layers: [{ ...doc.layers[0], cells }] });
}

const plain = (anim: ReturnType<typeof sample>) => JSON.stringify(toFileObject(anim));

describe('сериализация с кэшем ячеек', () => {
  it('текст тот же, что у прямого JSON.stringify, и при повторе из кэша', () => {
    for (const anim of [sample(), deserialize(v11), deserialize(v9)]) {
      expect(serialize(anim)).toBe(plain(anim));
      expect(serialize(anim)).toBe(plain(anim));
    }
  });

  it('после правки одного слоя — новая сетка сериализуется, текст по-прежнему верный', () => {
    const anim = sample();
    serialize(anim);
    const edited = mapFrames(anim, (doc) => ({
      ...doc,
      layers: [
        {
          ...doc.layers[0],
          cells: applyEdits(doc.layers[0].cells, new Map([[keyOf(5, 2), makeCell('x', '#fff')]])),
        },
      ],
    }));
    const text = serialize(edited);
    expect(text).toBe(plain(edited));
    expect(deserialize(text).frames[0].layers[0].cells.size).toBe(3);
  });

  it('строка, совпавшая с меткой, остаётся строкой: текст собирается без кэша', () => {
    const anim = sample();
    // Номер следующего вызова заранее неизвестен: метки с первыми сотнями номеров его перекрывают.
    for (let call = 0; call < 300; call++) {
      const tricky = mapFrames(anim, (doc) => ({
        ...doc,
        name: `\u0001cells-${call}:0`,
        layers: [{ ...doc.layers[0], name: `\u0001cells-${call}:1` }],
      }));
      const text = serialize(tricky);
      expect(text).toBe(plain(tricky));
      expect(deserialize(text).frames[0].layers[0].name).toBe(`\u0001cells-${call}:1`);
    }
  });
});
