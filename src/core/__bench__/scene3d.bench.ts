import { describe, it } from 'vitest';
import { cloudSprites, gridCells } from '../scene3d/glyphs';
import { pickBody3D } from '../scene3d/pick';
import { createNode3D, createScene3D } from '../scene3d/scene';
import type { Scene3D } from '../scene3d/types';

/**
 * Режим B: символы на поверхности тел считаются на CPU на каждый кадр движения — камеры, света,
 * ключей. Сцена — шар и тор вокруг него на весь кадр, солнце сбоку. Поворот тора на каждом
 * вызове свой, как при проигрывании: кэша сцены нет, точки поверхности берутся из кэша уровней.
 */
function scene(mode: 'grid' | 'cloud', turn: number): Scene3D {
  const base = createScene3D([
    createNode3D('sphere', 'Шар', { scale: [2.6, 2.6, 2.6] }),
    createNode3D('torus', 'Тор', { rotation: [70, turn, 0], scale: [4.5, 4.5, 4.5] }),
  ]);
  return { ...base, render: { ...base.render, mode, fog: 0.5 } };
}

let turn = 0;
const next = (mode: 'grid' | 'cloud'): Scene3D => scene(mode, (turn = (turn + 7) % 360));

describe('3D-слой, режим B', () => {
  it('облако символов на кадр', async ({ bench }) => {
    await bench.compare(
      bench('128×64', () => {
        cloudSprites(next('cloud'), 128, 64, []);
      }),
      bench('256×144', () => {
        cloudSprites(next('cloud'), 256, 144, []);
      }),
      bench('512×288', () => {
        cloudSprites(next('cloud'), 512, 288, []);
      }),
    );
  });

  it('символы по сетке на кадр', async ({ bench }) => {
    await bench.compare(
      bench('128×64', () => {
        gridCells(next('grid'), 128, 64, []);
      }),
      bench('256×144', () => {
        gridCells(next('grid'), 256, 144, []);
      }),
      bench('512×288', () => {
        gridCells(next('grid'), 512, 288, []);
      }),
    );
  });

  it('выбор тела щелчком', async ({ bench }) => {
    const still = scene('cloud', 0);
    await bench.compare(
      bench('128×64', () => {
        pickBody3D(still, 128, 64, [], 64, 32);
      }),
      bench('256×144', () => {
        pickBody3D(still, 256, 144, [], 128, 72);
      }),
    );
  });
});
