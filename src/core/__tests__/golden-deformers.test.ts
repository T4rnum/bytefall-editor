import { describe, expect, it } from 'vitest';
import { type Deformer, createDeformer, deform } from '../deformers';
import { ROWS_CENTER, dumpPoses, poseRows } from './helpers/poseScene';

/**
 * Золотые снимки деформеров: какие позы они дают. Снимки сняты со стеков деформеров до графа
 * узлов (слой 11) — граф, в который стеки мигрируют, обязан давать то же самое.
 */

const TIMES = [0, 137, 1250];

const STACKS: Record<string, readonly Deformer[]> = {
  wave: [{ ...createDeformer('wave', 'd'), amplitude: 0.75, wavelength: 5, period: 900 }],
  'wave-x': [{ ...createDeformer('wave', 'd'), axis: 'x', amplitude: 1.25 }],
  jitter: [{ ...createDeformer('jitter', 'd'), amplitude: 0.4, angle: 25, period: 120, seed: 7 }],
  twist: [{ ...createDeformer('twist', 'd'), strength: 12 }],
  scaleFalloff: [{ ...createDeformer('scaleFalloff', 'd'), radius: 3, inner: 1.6, outer: 0.4 }],
  colorRamp: [{ ...createDeformer('colorRamp', 'd'), axis: 'x', length: 4, period: 1500 }],
  'colorRamp-radial': [
    { ...createDeformer('colorRamp', 'd'), axis: 'radial', length: 3, period: 0, amount: 0.6 },
  ],
  bend: [{ ...createDeformer('bend', 'd'), strength: 15 }],
  explode: [{ ...createDeformer('explode', 'd'), amount: 0.8, angle: 120, seed: 3 }],
  glyphRamp: [{ ...createDeformer('glyphRamp', 'd'), glyphs: '.:-=+*#' }],
  particles: [{ ...createDeformer('particles', 'd'), rate: 10, life: 800, seed: 5 }],
  // Стек: частицы до волны тоже качаются, градиент красит и их; выключенный не действует.
  stack: [
    { ...createDeformer('particles', 'p'), rate: 8, life: 600 },
    { ...createDeformer('wave', 'w'), amplitude: 0.5 },
    { ...createDeformer('twist', 't'), enabled: false },
    { ...createDeformer('colorRamp', 'c'), axis: 'y', length: 2 },
  ],
};

describe('золотые снимки деформеров', () => {
  for (const [name, stack] of Object.entries(STACKS)) {
    it(name, async () => {
      const text = TIMES.map((time) => {
        const poses = deform(poseRows(), stack, { time, center: ROWS_CENTER });
        return `@${time}\n${dumpPoses(poses)}`;
      }).join('\n');
      await expect(text).toMatchFileSnapshot(`./golden/deformers-${name}.txt`);
    });
  }
});
