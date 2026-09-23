import { describe, expect, it } from 'vitest';
import { frameDocument } from '../animation';
import { updateLayer } from '../document';
import { createEffect } from '../effects';
import { evaluate, findEffect, readTarget } from '../evaluate';
import { findObject } from '../object';
import { setKey } from '../tracks';
import { BALL, ballScene, rollingBall } from './helpers/ballScene';

const ball = (doc: ReturnType<typeof evaluate>) => findObject(doc, BALL)!;

describe('сцена в момент времени', () => {
  it('объект между ключами стоит в целой ячейке, дробная часть — в сдвиге', () => {
    const { anim } = rollingBall();
    expect(ball(evaluate(anim, 500)).transform).toMatchObject({ x: 3, dx: 0, y: 1, dy: 0 });
    // 1.5 ячейки: домашняя ячейка 2, сдвиг −0.5 — не больше половины клетки.
    expect(ball(evaluate(anim, 125)).transform).toMatchObject({ x: 2, dx: -0.5 });
    expect(ball(evaluate(anim, 100)).transform).toMatchObject({ x: 1, dx: 0.4 });
    expect(ball(evaluate(anim, 5000)).transform).toMatchObject({ x: 5, dx: 0 });
  });

  it('без треков возвращает кадр как есть, а неанимированные узлы не пересоздаёт', () => {
    const { anim } = ballScene();
    const doc = evaluate(anim, 300);
    expect(doc.objects).toBe(anim.frames[0].objects);
    expect(doc.layers).toBe(anim.frames[0].layers);
    const moving = rollingBall().anim;
    expect(evaluate(moving, 300).layers).toBe(moving.frames[0].layers);
  });

  it('показывает кадр спрайт-трека, чьё время идёт, с треками поверх', () => {
    const { anim } = rollingBall(2);
    const at = (t: number) => {
      const obj = ball(evaluate(anim, t));
      return [obj.cells.values().next().value?.glyph, obj.transform.x];
    };
    expect(at(0)).toEqual(['O', 1]);
    expect(at(150)).toEqual(['o', 2]);
    // Кадры по кругу: 250 мс — снова первый кадр, а мяч едет дальше по ключам.
    expect(at(250)).toEqual(['O', 2]);
  });

  it('непрозрачность слоя и параметры эффекта берутся из треков', () => {
    const scene = ballScene();
    const layerId = scene.layerId;
    const fire = createEffect('fire', 'fx-fire');
    const doc = updateLayer(frameDocument(scene.anim, 0), layerId, { effects: [fire] });
    let tracks = setKey([], { node: 'layer', id: layerId, property: 'opacity' }, 0, [1]);
    tracks = setKey(tracks, { node: 'layer', id: layerId, property: 'opacity' }, 1000, [0]);
    tracks = setKey(tracks, { node: 'effect', id: 'fx-fire', property: 'height' }, 0, [2]);
    tracks = setKey(tracks, { node: 'effect', id: 'fx-fire', property: 'height' }, 1000, [12]);
    const anim = {
      ...scene.anim,
      frames: [{ ...scene.anim.frames[0], layers: doc.layers }],
      tracks,
    };
    const mid = evaluate(anim, 500);
    expect(mid.layers[0].opacity).toBe(0.5);
    // Высота огня целая: промежуточное значение округляется, как в файле.
    expect(findEffect(mid, 'fx-fire')?.effect).toMatchObject({ kind: 'fire', height: 7 });
  });

  it('неподвижный параметр эффекта не пересоздаёт эффект: его кэш узнаёт эффект по ссылке', () => {
    const scene = ballScene();
    const doc = updateLayer(frameDocument(scene.anim, 0), scene.layerId, {
      effects: [createEffect('pulse', 'fx-pulse')],
    });
    const target = { node: 'effect', id: 'fx-pulse', property: 'amplitude' } as const;
    const anim = {
      ...scene.anim,
      frames: [{ ...scene.anim.frames[0], layers: doc.layers }],
      tracks: setKey(setKey([], target, 0, [0.2]), target, 100, [0.9]),
    };
    const late = findEffect(evaluate(anim, 500), 'fx-pulse')?.effect;
    expect(findEffect(evaluate(anim, 900), 'fx-pulse')?.effect).toBe(late);
    expect(late).toMatchObject({ amplitude: 0.9 });
  });

  it('значение цели читается из документа, пропавшая цель — null', () => {
    const { anim, layerId } = rollingBall();
    const doc = evaluate(anim, 250);
    expect(readTarget(doc, { node: 'object', id: BALL, property: 'position' })).toEqual([2, 1]);
    expect(readTarget(doc, { node: 'object', id: BALL, property: 'tint' })).toEqual([0, 0, 0, 0]);
    expect(readTarget(doc, { node: 'layer', id: layerId, property: 'opacity' })).toEqual([1]);
    expect(readTarget(doc, { node: 'object', id: 'ghost', property: 'rotation' })).toBeNull();
    expect(readTarget(doc, { node: 'effect', id: 'nope', property: 'period' })).toBeNull();
  });
});
