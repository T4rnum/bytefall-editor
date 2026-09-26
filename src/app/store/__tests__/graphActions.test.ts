import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { composite } from '../../../core/compositor';
import { createDocument } from '../../../core/document';
import { keyOf } from '../../../core/grid';
import { addObject, createObject } from '../../../core/object';
import { bufferToText } from '../../../core/text';
import { useDocumentStore } from '../documentStore';
import { addPresetAction, linkAction, moveNodesAction, removeNodesAction } from '../graphActions';

const state = () => useDocumentStore.getState();
const doc = () => state().doc;
const IDS = ['a', 'b', 'c', 'd', 'e'];

/** Пять факелов «#» в ряд внизу холста 32×12. */
function setup(): void {
  let next = createDocument({ width: 32, height: 12, background: null });
  const layerId = next.layers[0].id;
  const cells = new Map([[keyOf(0, 0), makeCell('#')]]);
  IDS.forEach((id, i) => {
    next = addObject(next, createObject({ name: id, id, layerId, x: 2 + i * 6, y: 10, cells }));
  });
  state().replaceAnimation(createAnimation(next));
}

describe('граф узлов из интерфейса', () => {
  beforeEach(setup);

  it('один огонь раздан пяти объектам разом: у каждого свои узлы, одна запись истории', () => {
    const before = state().history.past.length;
    addPresetAction(IDS, 'fire');
    expect(state().history.past.length).toBe(before + 1);
    const fires = doc().objects.map((o) => o.graph?.nodes.find((n) => n.kind === 'fire')?.id);
    expect(fires.every(Boolean)).toBe(true);
    expect(new Set(fires).size).toBe(5);
    // Над каждым факелом пламя: в строке над ним что-то горит.
    const rows = bufferToText(composite(doc(), null, undefined, [], 500)).split('\n');
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 6;
      expect(rows[9].slice(x - 1, x + 2).trim()).not.toBe('');
    }
    state().undo();
    expect(doc().objects.every((o) => o.graph === null || o.graph.nodes.length === 2)).toBe(true);
  });

  it('перенос и удаление нескольких узлов, перестановка связи — каждое одной записью', () => {
    addPresetAction(['a'], 'pulse');
    const graph = () => doc().objects[0].graph!;
    const ids = graph()
      .nodes.filter((n) => n.kind === 'wave' || n.kind === 'position')
      .map((n) => n.id);
    const before = state().history.past.length;
    moveNodesAction(
      'a',
      ids.map((id) => ({ id, x: 10, y: 20 })),
    );
    expect(
      graph()
        .nodes.filter((n) => ids.includes(n.id))
        .every((n) => n.x === 10),
    ).toBe(true);
    const light = graph().nodes.find((n) => n.kind === 'light')!.id;
    const range = graph().links.find((l) => l.to === light && l.in === 'brightness')!;
    linkAction(
      'a',
      { node: range.from, out: 'value' },
      { node: light, in: 'opacity' },
      {
        node: light,
        in: 'brightness',
      },
    );
    // Связь со входа яркости переехала на непрозрачность, поток на месте.
    expect(
      graph()
        .links.filter((l) => l.to === light)
        .map((l) => l.in)
        .sort(),
    ).toEqual(['glyphs', 'opacity']);
    removeNodesAction('a', ids);
    expect(graph().nodes.some((n) => ids.includes(n.id))).toBe(false);
    expect(state().history.past.length).toBe(before + 3);
  });
});
