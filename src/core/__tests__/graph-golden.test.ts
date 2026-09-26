import { describe, expect, it } from 'vitest';
import { type Deformer, createDeformer } from '../graph/legacy';
import { chainGraph } from '../graph/build';
import { evaluateGraph, isAnimatedGraph } from '../graph/evaluate';
import { fragmentOfDeformer } from '../graph/presets';
import { keyOf } from '../grid';
import { ROWS_CENTER, dumpPoses, poseRows } from './helpers/poseScene';

/**
 * Граф, в который мигрирует стек деформеров, даёт те же позы, что давал стек: сравнение с
 * золотыми снимками, снятыми со стеков до графа (`golden-deformers.test.ts`).
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
  stack: [
    { ...createDeformer('particles', 'p'), rate: 8, life: 600 },
    { ...createDeformer('wave', 'w'), amplitude: 0.5 },
    { ...createDeformer('twist', 't'), enabled: false },
    { ...createDeformer('colorRamp', 'c'), axis: 'y', length: 2 },
  ],
};

const context = (time: number) => ({ time, center: ROWS_CENTER, cells: new Map() });

describe('граф из стека деформеров повторяет стек', () => {
  for (const [name, stack] of Object.entries(STACKS)) {
    it(name, async () => {
      const graph = chainGraph(stack.map(fragmentOfDeformer));
      const text = TIMES.map((time) => {
        const poses = evaluateGraph(graph, poseRows(), context(time));
        return `@${time}\n${dumpPoses(poses)}`;
      }).join('\n');
      await expect(text).toMatchFileSnapshot(`./golden/deformers-${name}.txt`);
    });
  }

  it('движение: волна и частицы — да, палочка яркости и выключенное — нет', () => {
    const graphOf = (d: Deformer) => chainGraph([fragmentOfDeformer(d)]);
    expect(isAnimatedGraph(graphOf(createDeformer('wave', 'w')))).toBe(true);
    expect(isAnimatedGraph(graphOf(createDeformer('particles', 'p')))).toBe(true);
    expect(isAnimatedGraph(graphOf(createDeformer('glyphRamp', 'g')))).toBe(false);
    expect(isAnimatedGraph(graphOf({ ...createDeformer('wave', 'w'), enabled: false }))).toBe(
      false,
    );
    expect(isAnimatedGraph(chainGraph([]))).toBe(false);
  });

  it('ветки не делят символы: поток на две связи копируется', () => {
    const graph = chainGraph([fragmentOfDeformer(createDeformer('particles', 'p'))]);
    const source = poseRows();
    const out = evaluateGraph(graph, source, context(500));
    const own = out.filter((p) => p.particle === null);
    expect(own).toHaveLength(12);
    expect(own[0]).not.toBe(source[0]);
    expect(own[0].key).toBe(keyOf(0, 0));
  });
});
