import { describe, expect, it } from 'vitest';
import {
  aliveNodes,
  duplicateAnimationLayer,
  frameDocument,
  mapFrames,
  resizeAnimation,
} from '../animation';
import { updateLayer } from '../document';
import { createEffect } from '../effects';
import { evaluate } from '../evaluate';
import { addObject, createObject, findObject } from '../object';
import { findTrack, setKey } from '../tracks';
import { BALL, rollingBall } from './helpers/ballScene';

describe('кадры и треки вместе', () => {
  it('размер холста от якоря сдвигает и объект, и ключи его положения', () => {
    const { anim } = rollingBall(2);
    const resized = resizeAnimation(anim, 12, 4, 'right');
    const track = findTrack(resized.tracks, { node: 'object', id: BALL, property: 'position' });
    expect(track?.keys.map((k) => k.value)).toEqual([
      [5, 1],
      [9, 1],
    ]);
    expect(findObject(evaluate(resized, 1000), BALL)!.transform.x).toBe(9);
    expect(frameDocument(resized, 1).objects[0].transform.x).toBe(5);
  });

  it('ключи ребёнка заданы относительно родителя и при смене размера не едут', () => {
    const { anim, layerId } = rollingBall();
    const kid = {
      ...createObject({ id: 'kid', name: 'Kid', layerId, x: 1, y: 0 }),
      parentId: BALL,
    };
    const doc = addObject(frameDocument(anim, 0), kid);
    const target = { node: 'object', id: 'kid', property: 'position' } as const;
    const withKid = {
      ...anim,
      frames: [{ ...anim.frames[0], objects: doc.objects }],
      tracks: setKey(anim.tracks, target, 0, [1, 0]),
    };
    const resized = resizeAnimation(withKid, 12, 4, 'right');
    expect(findTrack(resized.tracks, target)?.keys[0].value).toEqual([1, 0]);
  });

  it('операция, не изменившая кадр, оставляет тот же объект кадра', () => {
    const { anim } = rollingBall(2);
    const next = mapFrames(anim, (doc, i) => (i === 0 ? { ...doc, objects: [] } : doc));
    expect(next.frames[0]).not.toBe(anim.frames[0]);
    expect(next.frames[1]).toBe(anim.frames[1]);
    expect(mapFrames(anim, (doc) => doc)).toBe(anim);
  });

  it('копия слоя: объект один на все кадры, эффект свой, ключи скопированы', () => {
    const { anim, layerId } = rollingBall(2);
    const lit = mapFrames(anim, (doc) =>
      updateLayer(doc, layerId, { effects: [createEffect('pulse', 'fx-pulse')] }),
    );
    const amplitude = { node: 'effect', id: 'fx-pulse', property: 'amplitude' } as const;
    const withKeys = { ...lit, tracks: setKey(lit.tracks, amplitude, 0, [0.5]) };
    const next = duplicateAnimationLayer(withKeys, layerId, 'layer-copy');
    const copies = next.frames.map((f) => f.objects.find((o) => o.layerId === 'layer-copy')!);
    expect(copies[0].id).not.toBe(BALL);
    expect(copies[1].id).toBe(copies[0].id);
    const effectIds = next.frames.map((f) => f.layers[1].effects[0].id);
    expect(effectIds[0]).not.toBe('fx-pulse');
    expect(effectIds[1]).toBe(effectIds[0]);
    expect(next.tracks).toHaveLength(withKeys.tracks.length * 2);
    expect(findObject(evaluate(next, 1000), copies[0].id)!.transform.x).toBe(5);
    expect(duplicateAnimationLayer(anim, 'missing')).toBe(anim);
  });

  it('живые узлы — объекты всех кадров, слои и эффекты', () => {
    const { anim, layerId } = rollingBall();
    expect([...aliveNodes(anim.frames)].sort()).toEqual([`layer:${layerId}`, `object:${BALL}`]);
  });
});
