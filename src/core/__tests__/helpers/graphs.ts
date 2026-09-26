import { chainGraph, emptyGraph } from '../../graph/build';
import { addNode, connect, createNode } from '../../graph/edit';
import { evaluateGraph } from '../../graph/evaluate';
import type { Deformer } from '../../graph/legacy';
import { fragmentOfDeformer, fragmentsOfMaterial } from '../../graph/presets';
import type { GlyphPose, NodeGraph } from '../../graph/types';
import type { GlyphMaterial } from '../../material';

/** Граф из стека деформеров — так, как его строит миграция файлов версий 7–9. */
export const graphOf = (...deformers: readonly Deformer[]): NodeGraph =>
  chainGraph(deformers.map(fragmentOfDeformer));

/** Граф с одним материалом объекта `objectId`: контур, свечение, блик, дизеринг. */
export const materialGraph = (objectId: string, material: GlyphMaterial): NodeGraph =>
  chainGraph(fragmentsOfMaterial(objectId, material));

/** Позы после стека деформеров, посчитанного графом. */
export function runStack(
  poses: GlyphPose[],
  deformers: readonly Deformer[],
  time = 0,
  center = { x: 0.5, y: 0.5 },
): GlyphPose[] {
  return evaluateGraph(graphOf(...deformers), poses, { time, center, cells: new Map() });
}

/** Граф из узлов и связей по строкам «из.выход → в.вход». */
export function wired(nodes: [string, string][], links: string[]): NodeGraph {
  let g = emptyGraph();
  g = { ...g, links: [] };
  for (const [id, kind] of nodes) g = addNode(g, createNode(kind, 0, 0, id));
  for (const l of links) {
    const [from, to] = l.split(' → ');
    const [a, out] = from.split('.');
    const [b, input] = to.split('.');
    g = connect(g, { node: a, out }, { node: b, in: input });
  }
  return g;
}
