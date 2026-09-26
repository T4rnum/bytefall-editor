import { describe, expect, it } from 'vitest';
import { duplicateAnimationLayer, frameDocument } from '../animation';
import { evaluate, readTarget } from '../evaluate';
import { removeNode } from '../graph/edit';
import { createDeformer } from '../graph/legacy';
import { applyEdit, pruneTracks, unanimate } from '../keyframes';
import { duplicateObject, findObject, moveObject, pasteObject, updateObject } from '../object';
import { deserialize, serialize } from '../serialization';
import { findTrack, setKey } from '../tracks';
import { BALL, ballScene } from './helpers/ballScene';
import { graphOf } from './helpers/graphs';

/** Сила сдвига в сборке «Волна»: бывший размах волны. */
const strength = { node: 'node', id: 'wave~offset', property: 'strength' } as const;

/** Мяч с волной, сила которой за секунду растёт с нуля до двух. */
function wavingBall() {
  const { anim } = ballScene();
  const wave = { ...createDeformer('wave', 'wave'), amplitude: 0.5 };
  const doc = updateObject(frameDocument(anim, 0), BALL, { graph: graphOf(wave) });
  const tracks = setKey(setKey([], strength, 0, [0]), strength, 1000, [2]);
  return { ...anim, frames: [{ ...anim.frames[0], objects: doc.objects }], tracks };
}

const ballGraph = (doc: ReturnType<typeof evaluate>) => findObject(doc, BALL)!.graph!;
const strengthOf = (doc: ReturnType<typeof evaluate>) =>
  ballGraph(doc).nodes.find((n) => n.id === strength.id)!.values.strength;

describe('ключи входов узла', () => {
  it('вход идёт по ключам в вычисленной сцене, в кадре остаётся своё значение', () => {
    const anim = wavingBall();
    expect(strengthOf(evaluate(anim, 500))).toBe(1);
    expect(readTarget(evaluate(anim, 250), strength)).toEqual([0.5]);
    expect(strengthOf(frameDocument(anim, 0))).toBe(0.5);
  });

  it('правка объекта не оставляет в кадре значения ключей на этот момент', () => {
    const anim = wavingBall();
    const shown = evaluate(anim, 500);
    const next = applyEdit(anim, 500, shown, moveObject(shown, BALL, 1, 0));
    expect(strengthOf(frameDocument(next, 0))).toBe(0.5);
    expect(findTrack(next.tracks, strength)?.keys).toHaveLength(2);
  });

  it('отказ от анимации замораживает вход, треки узла живут вместе с ним', () => {
    const anim = wavingBall();
    expect(strengthOf(frameDocument(unanimate(anim, strength, 750), 0))).toBe(1.5);
    expect(pruneTracks(anim)).toBe(anim);
    const withGraph = (graph: ReturnType<typeof ballGraph> | null) => {
      const doc = updateObject(frameDocument(anim, 0), BALL, { graph });
      return { ...anim, frames: [{ ...anim.frames[0], objects: doc.objects }] };
    };
    expect(pruneTracks(withGraph(null)).tracks).toEqual([]);
    const removed = removeNode(ballGraph(frameDocument(anim, 0)), strength.id);
    expect(pruneTracks(withGraph(removed)).tracks).toEqual([]);
  });

  it('трек узла переживает сохранение', () => {
    const back = deserialize(serialize(wavingBall()));
    expect(findTrack(back.tracks, strength)?.keys.map((k) => k.value)).toEqual([[0], [2]]);
  });
});

describe('копии объекта с графом', () => {
  const hasNode = (graph: ReturnType<typeof ballGraph>, id: string) =>
    graph.nodes.some((n) => n.id === id);

  it('копия и вставка под новым id получают свои узлы, тот же объект — те же', () => {
    const anim = wavingBall();
    const doc = frameDocument(anim, 0);
    const copy = duplicateObject(doc, BALL).objects[1];
    expect(hasNode(copy.graph!, strength.id)).toBe(false);
    expect(copy.graph!.nodes).toHaveLength(ballGraph(doc).nodes.length);
    const ball = findObject(doc, BALL)!;
    expect(hasNode(pasteObject(doc, ball, ball.layerId).object.graph!, strength.id)).toBe(false);
    const elsewhere = { ...doc, objects: [] };
    expect(hasNode(pasteObject(elsewhere, ball, ball.layerId).object.graph!, strength.id)).toBe(
      true,
    );
  });

  it('копия слоя уносит ключи узла на новый узел', () => {
    const anim = wavingBall();
    const layerId = anim.frames[0].layers[0].id;
    const next = duplicateAnimationLayer(anim, layerId, 'layer-copy');
    const copy = next.frames[0].objects.find((o) => o.layerId === 'layer-copy')!;
    const copied = { ...strength, id: copy.graph!.nodes.find((n) => n.kind === 'offset')!.id };
    expect(copied.id).not.toBe(strength.id);
    expect(findTrack(next.tracks, copied)?.keys).toHaveLength(2);
  });
});
