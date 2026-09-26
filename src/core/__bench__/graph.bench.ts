import { describe, it } from 'vitest';
import { makeCell } from '../cell';
import { type Document, createDocument } from '../document';
import { composeFrame } from '../frame';
import { chainGraph } from '../graph/build';
import { type Deformer, createDeformer } from '../graph/legacy';
import { fragmentOfDeformer, fragmentsOfMaterial } from '../graph/presets';
import type { NodeGraph } from '../graph/types';
import { keyOf } from '../grid';
import { DEFAULT_GLOW } from '../material';
import { addObject, createObject } from '../object';

/**
 * Объект с графом узлов: 64×16 символов, 1024 на кадр. Меряется поток символов кадра —
 * вычисление графа и заливка символов с материалом, как на экране при проигрывании. Время
 * каждый раз новое: у графа с волной и частицами кэша по времени нет.
 */
function banner(graph: NodeGraph): Document {
  const base = createDocument({ width: 80, height: 40, background: null });
  const cells = new Map(
    Array.from({ length: 64 * 16 }, (_, i) => [keyOf(i % 64, Math.floor(i / 64)), makeCell('#')]),
  );
  const obj = createObject({ id: 'b', name: 'b', layerId: base.layers[0].id, x: 8, y: 12, cells });
  return addObject(base, { ...obj, graph });
}

const stack: Deformer[] = [
  createDeformer('wave', 'w'),
  createDeformer('jitter', 'j'),
  createDeformer('colorRamp', 'c'),
];
const glowing = banner(
  chainGraph([
    ...stack.map(fragmentOfDeformer),
    ...fragmentsOfMaterial('b', { outline: null, glow: DEFAULT_GLOW, shine: null, dither: null }),
  ]),
);
const sparks = banner(
  chainGraph([fragmentOfDeformer({ ...createDeformer('particles', 'p'), rate: 200, life: 1500 })]),
);

describe('граф объекта, 1024 символа', () => {
  it('поток символов кадра', async ({ bench }) => {
    let time = 0;
    await bench.compare(
      bench('волна, дрожание, градиент, свечение', () => {
        composeFrame(glowing, null, null, [], (time += 16));
      }),
      bench('частицы, 200 в секунду', () => {
        composeFrame(sparks, null, null, [], (time += 16));
      }),
    );
  });
});
