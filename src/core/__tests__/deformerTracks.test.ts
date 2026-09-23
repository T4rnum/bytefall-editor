import { describe, expect, it } from 'vitest';
import { duplicateAnimationLayer, frameDocument } from '../animation';
import { createDeformer } from '../deformers';
import { evaluate, readTarget } from '../evaluate';
import { applyEdit, pruneTracks, unanimate } from '../keyframes';
import { duplicateObject, findObject, moveObject, pasteObject, updateObject } from '../object';
import { deserialize, serialize } from '../serialization';
import { findTrack, setKey } from '../tracks';
import { BALL, ballScene } from './helpers/ballScene';

const amplitude = { node: 'deformer', id: 'wave', property: 'amplitude' } as const;

/** Мяч с волной, размах которой за секунду растёт с нуля до двух. */
function wavingBall() {
  const { anim } = ballScene();
  const wave = { ...createDeformer('wave', 'wave'), amplitude: 0.5 };
  const doc = updateObject(frameDocument(anim, 0), BALL, { deformers: [wave] });
  const tracks = setKey(setKey([], amplitude, 0, [0]), amplitude, 1000, [2]);
  return { ...anim, frames: [{ ...anim.frames[0], objects: doc.objects }], tracks };
}

const waveOf = (doc: ReturnType<typeof evaluate>) => findObject(doc, BALL)!.deformers[0];

describe('ключи параметров деформера', () => {
  it('параметр идёт по ключам в вычисленной сцене, в кадре остаётся своё значение', () => {
    const anim = wavingBall();
    expect(waveOf(evaluate(anim, 500))).toMatchObject({ amplitude: 1 });
    expect(readTarget(evaluate(anim, 250), amplitude)).toEqual([0.5]);
    expect(waveOf(frameDocument(anim, 0))).toMatchObject({ amplitude: 0.5 });
  });

  it('правка объекта не оставляет в кадре значения ключей на этот момент', () => {
    const anim = wavingBall();
    const shown = evaluate(anim, 500);
    const next = applyEdit(anim, 500, shown, moveObject(shown, BALL, 1, 0));
    expect(waveOf(frameDocument(next, 0))).toMatchObject({ amplitude: 0.5 });
    expect(findTrack(next.tracks, amplitude)?.keys).toHaveLength(2);
  });

  it('отказ от анимации замораживает параметр, треки деформера живут вместе с ним', () => {
    const anim = wavingBall();
    expect(waveOf(frameDocument(unanimate(anim, amplitude, 750), 0))).toMatchObject({
      amplitude: 1.5,
    });
    expect(pruneTracks(anim)).toBe(anim);
    const gone = updateObject(frameDocument(anim, 0), BALL, { deformers: [] });
    const without = { ...anim, frames: [{ ...anim.frames[0], objects: gone.objects }] };
    expect(pruneTracks(without).tracks).toEqual([]);
  });

  it('трек деформера переживает сохранение', () => {
    const back = deserialize(serialize(wavingBall()));
    expect(findTrack(back.tracks, amplitude)?.keys.map((k) => k.value)).toEqual([[0], [2]]);
  });
});

describe('копии объекта с деформерами', () => {
  it('копия и вставка под новым id получают свои деформеры, тот же объект — те же', () => {
    const anim = wavingBall();
    const doc = frameDocument(anim, 0);
    const copy = duplicateObject(doc, BALL).objects[1];
    expect(copy.deformers[0].id).not.toBe('wave');
    const ball = findObject(doc, BALL)!;
    expect(pasteObject(doc, ball, ball.layerId).object.deformers[0].id).not.toBe('wave');
    const elsewhere = { ...doc, objects: [] };
    expect(pasteObject(elsewhere, ball, ball.layerId).object.deformers[0].id).toBe('wave');
  });

  it('копия слоя уносит ключи деформера на новый деформер', () => {
    const anim = wavingBall();
    const layerId = anim.frames[0].layers[0].id;
    const next = duplicateAnimationLayer(anim, layerId, 'layer-copy');
    const copy = next.frames[0].objects.find((o) => o.layerId === 'layer-copy')!;
    const copied = { ...amplitude, id: copy.deformers[0].id };
    expect(copied.id).not.toBe('wave');
    expect(findTrack(next.tracks, copied)?.keys).toHaveLength(2);
  });
});
