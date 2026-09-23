import { describe, expect, it } from 'vitest';
import { frameDocument } from '../animation';
import { makeCell } from '../cell';
import { updateLayer } from '../document';
import { createEffect } from '../effects';
import { evaluate } from '../evaluate';
import { keyOf } from '../grid';
import { removeObject } from '../hierarchy';
import { applyEdit, deleteKeys, keyCurrentValue, pruneTracks, unanimate } from '../keyframes';
import {
  addObject,
  createObject,
  findObject,
  moveObject,
  transformObject,
  updateObject,
} from '../object';
import { findTrack, setKey, trackKey } from '../tracks';
import { BALL, ballScene, rollingBall } from './helpers/ballScene';

const position = { node: 'object', id: BALL, property: 'position' } as const;
const rotation = { node: 'object', id: BALL, property: 'rotation' } as const;

/** Правка на экране в момент time, записанная обратно в анимацию. */
function editAt(
  anim: ReturnType<typeof rollingBall>['anim'],
  time: number,
  edit: (doc: ReturnType<typeof evaluate>) => ReturnType<typeof evaluate>,
) {
  const evaluated = evaluate(anim, time);
  return applyEdit(anim, time, evaluated, edit(evaluated));
}

describe('правка вычисленного кадра', () => {
  it('сдвиг анимированного объекта ставит ключ в текущий момент, кадр не трогает', () => {
    const { anim } = rollingBall();
    const next = editAt(anim, 500, (doc) => moveObject(doc, BALL, 0, 2));
    const keys = findTrack(next.tracks, position)!.keys;
    expect(keys.map((k) => [k.time, k.value])).toEqual([
      [0, [1, 1]],
      [500, [3, 3]],
      [1000, [5, 1]],
    ]);
    expect(findObject(frameDocument(next, 0), BALL)!.transform).toEqual(
      findObject(frameDocument(anim, 0), BALL)!.transform,
    );
    expect(findObject(evaluate(next, 500), BALL)!.transform).toMatchObject({ x: 3, y: 3 });
  });

  it('правка неанимированного свойства пишется как есть и ключа не ставит', () => {
    const { anim } = rollingBall();
    // Положение между ключами дробное; поворот его не касается и ключа положения не рождает.
    const next = editAt(anim, 125, (doc) => transformObject(doc, BALL, { rot: 90 }));
    expect(findTrack(next.tracks, position)!.keys).toHaveLength(2);
    expect(findTrack(next.tracks, rotation)).toBeUndefined();
    const stored = findObject(frameDocument(next, 0), BALL)!;
    expect(stored.transform).toMatchObject({ rot: 90, x: 1, dx: 0 });
  });

  it('нетронутый анимированный объект возвращается в кадр таким, каким там лежал', () => {
    const { anim } = rollingBall();
    const next = editAt(anim, 500, (doc) => ({ ...doc, name: 'Переименован' }));
    expect(next.name).toBe('Переименован');
    expect(next.frames[0].objects).toEqual(anim.frames[0].objects);
    expect(next.tracks).toBe(anim.tracks);
  });

  it('правка без изменений ничего не меняет', () => {
    const { anim } = rollingBall();
    const evaluated = evaluate(anim, 300);
    expect(applyEdit(anim, 300, evaluated, evaluated)).toBe(anim);
  });

  it('новый объект пишется как есть', () => {
    const { anim, layerId } = rollingBall();
    const star = createObject({ id: 'star', name: 'Star', layerId, x: 6, y: 2 });
    const next = editAt(anim, 500, (doc) => addObject(doc, star));
    expect(findObject(frameDocument(next, 0), 'star')).toEqual(star);
  });

  it('ключ правки встаёт на трек, общий для всех кадров', () => {
    const { anim } = rollingBall(2);
    const next = editAt(anim, 150, (doc) => moveObject(doc, BALL, 0, 1));
    expect(findTrack(next.tracks, position)!.keys.map((k) => k.time)).toEqual([0, 150, 1000]);
    // Второй кадр идёт с 100 до 200 мс: правка попала в него, и его кадр не изменился.
    expect(next.frames[1].objects).toEqual(anim.frames[1].objects);
  });

  it('удалённый объект уносит свои треки, если его нет больше ни в одном кадре', () => {
    const one = rollingBall().anim;
    expect(editAt(one, 500, (doc) => removeObject(doc, BALL)).tracks).toEqual([]);
    const two = rollingBall(2).anim;
    const kept = editAt(two, 50, (doc) => removeObject(doc, BALL));
    expect(kept.tracks).toHaveLength(1);
  });

  it('у слоя с тронутыми ячейками анимированные непрозрачность и эффект — из кадра', () => {
    const scene = ballScene();
    const layerId = scene.layerId;
    const doc = updateLayer(frameDocument(scene.anim, 0), layerId, {
      effects: [createEffect('pulse', 'fx-pulse')],
    });
    const fade = { node: 'layer', id: layerId, property: 'opacity' } as const;
    const amplitude = { node: 'effect', id: 'fx-pulse', property: 'amplitude' } as const;
    let tracks = setKey(setKey([], fade, 0, [1]), fade, 1000, [0]);
    tracks = setKey(setKey(tracks, amplitude, 0, [0]), amplitude, 1000, [1]);
    const anim = {
      ...scene.anim,
      frames: [{ ...scene.anim.frames[0], layers: doc.layers }],
      tracks,
    };

    const next = editAt(anim, 500, (d) =>
      updateLayer(d, layerId, { cells: new Map([[keyOf(0, 0), makeCell('#', '#ffffff')]]) }),
    );
    const layer = next.frames[0].layers[0];
    expect(layer.cells.size).toBe(1);
    expect(layer.opacity).toBe(1);
    expect(layer.effects).toBe(doc.layers[0].effects);
    expect(next.tracks).toBe(anim.tracks);
  });
});

describe('ключи на уровне анимации', () => {
  it('ключ из текущего значения — то, что видно на экране в этот момент', () => {
    const { anim } = rollingBall();
    const next = keyCurrentValue(anim, rotation, 400);
    expect(findTrack(next.tracks, rotation)!.keys.map((k) => [k.time, k.value])).toEqual([
      [400, [0]],
    ]);
    expect(keyCurrentValue(anim, { ...rotation, id: 'ghost' }, 0)).toBe(anim);
  });

  it('отказ от анимации оставляет значение на момент отказа во всех кадрах', () => {
    const { anim } = rollingBall(2);
    const next = unanimate(anim, position, 250);
    expect(findTrack(next.tracks, position)).toBeUndefined();
    for (const frame of next.frames) {
      expect(frame.objects[0].transform).toMatchObject({ x: 2, dx: 0 });
    }
    expect(unanimate(next, position, 0)).toBe(next);
  });

  it('удаление ключей: трек остаётся, пока в нём есть ключи, последний замирает', () => {
    const { anim } = rollingBall();
    const ref = (time: number) => ({ track: trackKey(position), time });
    const one = deleteKeys(anim, [ref(0)], 300);
    expect(findTrack(one.tracks, position)!.keys).toHaveLength(1);
    const none = deleteKeys(anim, [ref(0), ref(1000)], 750);
    expect(none.tracks).toEqual([]);
    expect(findObject(frameDocument(none, 0), BALL)!.transform).toMatchObject({ x: 4, dx: 0 });
    expect(deleteKeys(anim, [ref(123)], 0)).toBe(anim);
  });

  it('треки без цели убираются, живые остаются тем же массивом', () => {
    const { anim } = rollingBall();
    expect(pruneTracks(anim)).toBe(anim);
    const gone = {
      ...anim,
      frames: [{ ...anim.frames[0], objects: [] }],
    };
    expect(pruneTracks(gone).tracks).toEqual([]);
  });

  it('объект с правками символов и дробным сдвигом читается в положение без потерь', () => {
    const { anim } = ballScene();
    const doc = updateObject(frameDocument(anim, 0), BALL, {
      transform: { ...findObject(frameDocument(anim, 0), BALL)!.transform, dx: 0.25 },
    });
    const moved = { ...anim, frames: [{ ...anim.frames[0], objects: doc.objects }] };
    const next = keyCurrentValue(moved, position, 0);
    expect(findTrack(next.tracks, position)!.keys[0].value).toEqual([1.25, 1]);
  });
});
