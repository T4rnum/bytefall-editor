import { describe, expect, it } from 'vitest';
import {
  type Animation,
  createAnimation,
  duplicateAnimationLayer,
  frameDocument,
  mapFrames,
} from '../animation';
import { canEditLayer, canPaintLayer, createDocument } from '../document';
import { evaluate, readTarget } from '../evaluate';
import { applyEdit, pruneTracks, setTargetValue, unanimate } from '../keyframes';
import {
  addNode3D,
  createNode3D,
  createScene3D,
  limitValue3D,
  readScene3DValue,
  removeNode3D,
  writeNode3DValue,
  writeScene3DValue,
} from '../scene3d/scene';
import { findTrack, setKey, valueKind } from '../tracks';

const position = { node: 'body3d', id: 'cube', property: 'position' } as const;
const camera = { node: 'scene3d', id: 'l3d', property: 'cameraPosition' } as const;

/** Два кадра, 3D-слой с кубом: куб за секунду едет от 0 до 2 по X. */
function cubeScene(): Animation {
  const base = createDocument({ width: 16, height: 8 });
  const scene = addNode3D(createScene3D(), createNode3D('box', 'Куб', {}, 'cube'));
  let anim = createAnimation({ ...base, layers: [{ ...base.layers[0], id: 'l3d', scene }] });
  anim = { ...anim, frames: [anim.frames[0], { ...anim.frames[0], id: 'f2' }] };
  const tracks = setKey(setKey([], position, 0, [0, 0, 0]), position, 1000, [2, 0, 0]);
  return { ...anim, tracks };
}

const cubeAt = (doc: ReturnType<typeof evaluate>) => doc.layers[0].scene!.nodes[0];

describe('3D-сцена слоя', () => {
  it('тела добавляются и убираются, значения — в пределах свойства', () => {
    const scene = addNode3D(createScene3D(), createNode3D('sphere', 'Шар', {}, 's'));
    expect(scene.nodes.map((n) => n.kind)).toEqual(['sphere']);
    expect(removeNode3D(scene, 's').nodes).toEqual([]);
    expect(removeNode3D(scene, 'нет')).toBe(scene);
    const node = scene.nodes[0];
    expect(writeNode3DValue(node, 'scale', [0, 5, 1e9]).scale).toEqual([0.001, 5, 1000]);
    expect(writeNode3DValue(node, 'position', [0, 0, 0])).toBe(node);
    expect(limitValue3D('fov', [500])).toEqual([170]);
    expect(limitValue3D('sunElevation', [Number.NaN])).toEqual([0]);
    const lit = writeScene3DValue(scene, 'sunAzimuth', [90]);
    expect(readScene3DValue(lit, 'sunAzimuth')).toEqual([90]);
    expect(readScene3DValue(lit, 'cameraTarget')).toEqual([0, 0, 0]);
  });

  it('ключи тела и камеры — три канала, между ключами — середина', () => {
    expect(valueKind(position)).toBe('vec3');
    expect(valueKind(camera)).toBe('vec3');
    expect(valueKind({ node: 'scene3d', id: 'l3d', property: 'fov' })).toBe('scalar');
    const anim = cubeScene();
    expect(cubeAt(evaluate(anim, 500)).position).toEqual([1, 0, 0]);
    expect(readTarget(evaluate(anim, 250), position)).toEqual([0.5, 0, 0]);
    // Без треков сцена та же по ссылке: рендер не считает неподвижную сцену заново.
    const still = { ...anim, tracks: [] };
    expect(evaluate(still, 300).layers[0].scene).toBe(still.frames[0].layers[0].scene);
    const moving = { ...anim, tracks: setKey([], camera, 0, [0, 1, 5]) };
    expect(evaluate(moving, 0).layers[0].scene!.camera.position).toEqual([0, 1, 5]);
  });

  it('правка без ключей идёт во все кадры, с ключами — ключ; отказ замораживает значение', () => {
    const anim = cubeScene();
    const fov = { node: 'scene3d', id: 'l3d', property: 'fov' } as const;
    const wide = setTargetValue(anim, fov, 0, [70]);
    expect(wide.frames.map((f) => f.layers[0].scene!.camera.fov)).toEqual([70, 70]);
    const keyed = setTargetValue(anim, position, 500, [5, 5, 5]);
    expect(findTrack(keyed.tracks, position)!.keys).toHaveLength(3);
    const frozen = unanimate(anim, position, 750);
    expect(frozen.frames.map((f) => f.layers[0].scene!.nodes[0].position)).toEqual([
      [1.5, 0, 0],
      [1.5, 0, 0],
    ]);
  });

  it('правка слоя на экране не запекает в кадр значения ключей сцены', () => {
    const anim = cubeScene();
    // 50 мс — ещё первый кадр спрайт-трека, а куб уже сдвинут ключами.
    const shown = evaluate(anim, 50);
    expect(cubeAt(shown).position[0]).toBeGreaterThan(0);
    const renamed = { ...shown, layers: [{ ...shown.layers[0], name: 'Сцена' }] };
    const next = applyEdit(anim, 50, shown, renamed);
    const stored = frameDocument(next, 0).layers[0];
    expect(stored.name).toBe('Сцена');
    expect(stored.scene!.nodes[0].position).toEqual([0, 0, 0]);
  });

  it('треки убранного тела уходят, копия слоя получает свои тела и ключи', () => {
    const anim = cubeScene();
    const gone = mapFrames(anim, (doc) => ({
      ...doc,
      layers: [{ ...doc.layers[0], scene: removeNode3D(doc.layers[0].scene!, 'cube') }],
    }));
    expect(pruneTracks(gone).tracks).toEqual([]);
    expect(pruneTracks(anim)).toBe(anim);
    const copied = duplicateAnimationLayer(anim, 'l3d', 'copy');
    const copy = copied.frames[0].layers.find((l) => l.id === 'copy')!.scene!.nodes[0];
    expect(copy.id).not.toBe('cube');
    expect(copied.frames[1].layers.find((l) => l.id === 'copy')!.scene!.nodes[0].id).toBe(copy.id);
    expect(findTrack(copied.tracks, { ...position, id: copy.id })!.keys).toHaveLength(2);
  });
});

describe('3D-слой в правке', () => {
  it('в ячейки 3D-слоя не рисуют, а сам слой и его объекты править можно', () => {
    const layer = cubeScene().frames[0].layers[0];
    expect(canEditLayer(layer)).toBe(true);
    expect(canPaintLayer(layer)).toBe(false);
    expect(canPaintLayer({ ...layer, scene: null })).toBe(true);
  });
});
