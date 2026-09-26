import { bendNode, colorNode, glyphNode, offsetNode, rotateNode, scaleNode } from './actionNodes';
import {
  brightnessNode,
  distanceNode,
  gradientNode,
  mapRangeNode,
  mathNode,
  noiseNode,
  positionNode,
  timeNode,
  valueNode,
  waveNode,
} from './fieldNodes';
import { bonesNode, joinNode, particlesNode } from './generatorNodes';
import { ditherNode, glowNode, outlineNode, shineNode } from './materialNodes';
import { glyphsIn, glyphsOut } from './specs';
import type { NodeImpl, NodeSpec } from './types';

/** Символы объекта: с них начинается граф. Их подставляет вычислитель. */
export const inputNode: NodeImpl = {
  spec: {
    kind: 'input',
    label: 'Объект',
    category: 'input',
    hint: 'Символы объекта, как они нарисованы, с правками отдельных символов',
    inputs: [],
    outputs: [glyphsOut()],
    options: [],
  },
  run: () => ({ glyphs: [] }),
};

/** Что рисуется: поток на этом входе и есть объект на экране, в экспорте и в движке. */
export const outputNode: NodeImpl = {
  spec: {
    kind: 'output',
    label: 'Вывод',
    category: 'output',
    hint: 'То, что рисуется',
    inputs: [glyphsIn()],
    outputs: [],
    options: [],
  },
  run: (r) => ({ glyphs: r.glyphs('glyphs') }),
};

/**
 * Словарь узлов. Порядок — порядок в меню добавления внутри категории. Двух узлов, делающих одно
 * и то же, в нём нет: волна — это синус на сдвиг, дрожание — шум на сдвиг и поворот.
 */
export const NODES: readonly NodeImpl[] = [
  inputNode,
  outputNode,
  valueNode,
  timeNode,
  positionNode,
  distanceNode,
  waveNode,
  noiseNode,
  gradientNode,
  brightnessNode,
  mathNode,
  mapRangeNode,
  offsetNode,
  rotateNode,
  scaleNode,
  colorNode,
  glyphNode,
  bendNode,
  bonesNode,
  particlesNode,
  joinNode,
  outlineNode,
  glowNode,
  shineNode,
  ditherNode,
];

const BY_KIND = new Map(NODES.map((n) => [n.spec.kind, n]));

export function nodeImpl(kind: string): NodeImpl | undefined {
  return BY_KIND.get(kind);
}

export function nodeSpec(kind: string): NodeSpec | undefined {
  return BY_KIND.get(kind)?.spec;
}
