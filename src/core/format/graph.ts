import { z } from 'zod';
import { isHexColor, normalizeHex } from '../color';
import { chainGraph } from '../graph/build';
import { graphProblem } from '../graph/edit';
import type { Deformer } from '../graph/legacy';
import { nodeSpec } from '../graph/nodes';
import { type Fragment, fragmentOfDeformer, fragmentsOfMaterial } from '../graph/presets';
import type { GraphNode, NodeGraph, NodeSpec, OptionValue } from '../graph/types';
import type { GlyphMaterial } from '../material';
import { MAX_SKIN_BONES } from '../skin';
import { boneSchema } from './deformers';
import { DocumentFormatError, MAX_ID_LENGTH } from './primitives';

/** Больше узлов и связей в графе одного объекта файл не примет. */
export const MAX_GRAPH_NODES = 96;
export const MAX_GRAPH_LINKS = 192;
/** Поле редактора узлов, в его единицах: узел дальше этого — испорченный файл. */
const MAX_LAYOUT = 1e5;

/** Идентификатор узла: у мигрированных — идентификатор деформера плюс роль, поэтому длиннее. */
const nodeId = z
  .string()
  .min(1)
  .max(MAX_ID_LENGTH + 16);
const name = z.string().min(1).max(32);

const optionValue = z.union([
  z.string().max(64),
  z.number().finite(),
  z.array(boneSchema).max(MAX_SKIN_BONES),
]);

const nodeSchema = z.object({
  id: nodeId,
  kind: name,
  muted: z.boolean().optional(),
  x: z.number().min(-MAX_LAYOUT).max(MAX_LAYOUT),
  y: z.number().min(-MAX_LAYOUT).max(MAX_LAYOUT),
  values: z.record(name, z.number().finite()).optional(),
  options: z.record(name, optionValue).optional(),
});

const linkSchema = z.object({ from: nodeId, out: name, to: nodeId, in: name });

/** Граф узлов объекта (версия 10). */
export const graphSchema = z.object({
  nodes: z.array(nodeSchema).min(2).max(MAX_GRAPH_NODES),
  links: z.array(linkSchema).max(MAX_GRAPH_LINKS),
});

type GraphFile = z.infer<typeof graphSchema>;
type NodeFile = z.infer<typeof nodeSchema>;

/** Числа на входах: только числовые входы этого вида и в их пределах. */
function valuesFromFile(node: NodeFile, spec: NodeSpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [input, value] of Object.entries(node.values ?? {})) {
    const s = spec.inputs.find((i) => i.name === input && i.type === 'number');
    if (!s) throw new DocumentFormatError(`Node ${node.id} has no number input ${input}`);
    const bad =
      value < (s.min ?? -Infinity) ||
      value > (s.max ?? Infinity) ||
      (s.integer === true && !Number.isInteger(value));
    if (bad) throw new DocumentFormatError(`Node ${node.id}: ${input} is out of range`);
    out[input] = value;
  }
  return out;
}

/** Настройки: только свои для вида узла и того типа, что ждёт настройка. */
function optionsFromFile(node: NodeFile, spec: NodeSpec): Record<string, OptionValue> {
  const out: Record<string, OptionValue> = {};
  for (const [key, value] of Object.entries(node.options ?? {})) {
    const s = spec.options.find((o) => o.name === key);
    const fail = (): never => {
      throw new DocumentFormatError(`Node ${node.id}: bad option ${key}`);
    };
    if (!s) return fail();
    switch (s.type) {
      case 'enum':
        if (typeof value !== 'string' || !s.values.some((v) => v.value === value)) fail();
        out[key] = value;
        break;
      case 'text':
        if (typeof value !== 'string' || value.length > s.maxLength) fail();
        out[key] = value;
        break;
      case 'color':
        if (typeof value !== 'string' || !isHexColor(value)) fail();
        out[key] = normalizeHex(value as string);
        break;
      case 'number': {
        const n = typeof value === 'number' ? value : fail();
        if (n < s.min || n > s.max || (s.integer === true && !Number.isInteger(n))) fail();
        out[key] = n;
        break;
      }
      case 'bones':
        if (!Array.isArray(value)) fail();
        out[key] = value;
        break;
    }
  }
  return out;
}

/** Граф из файла: каждый узел проверен по своему виду, устройство графа — `graphProblem`. */
export function graphFromFile(file: GraphFile, objectId: string): NodeGraph {
  const nodes = file.nodes.map((n): GraphNode => {
    const spec = nodeSpec(n.kind);
    if (!spec) throw new DocumentFormatError(`Object ${objectId}: unknown node kind ${n.kind}`);
    return {
      id: n.id,
      kind: n.kind,
      muted: n.muted ?? false,
      x: n.x,
      y: n.y,
      values: valuesFromFile(n, spec),
      options: optionsFromFile(n, spec),
    };
  });
  const graph: NodeGraph = { nodes, links: file.links.map((l) => ({ ...l })) };
  const problem = graphProblem(graph);
  if (problem) throw new DocumentFormatError(`Object ${objectId} graph: ${problem}`);
  return graph;
}

export function graphToFile(graph: NodeGraph): GraphFile {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      ...(n.muted ? { muted: true } : {}),
      x: n.x,
      y: n.y,
      ...(Object.keys(n.values).length > 0 ? { values: { ...n.values } } : {}),
      ...(Object.keys(n.options).length > 0 ? { options: optionsToFile(n.options) } : {}),
    })),
    links: graph.links.map((l) => ({ ...l })),
  };
}

function optionsToFile(options: Readonly<Record<string, OptionValue>>): NodeFile['options'] {
  const out: NonNullable<NodeFile['options']> = {};
  for (const [k, v] of Object.entries(options)) {
    out[k] =
      typeof v === 'string' || typeof v === 'number'
        ? v
        : v.map((b) => ({ ...b, bind: { ...b.bind } }));
  }
  return out;
}

/**
 * Куда уехал параметр деформера версий 7–9: `идентификатор деформера\nпараметр` → вход узла.
 * По этой таблице ключи старого файла находят новые цели.
 */
export type DeformerMigration = Map<string, { readonly node: string; readonly input: string }>;

export const migrationKey = (deformerId: string, param: string): string =>
  `${deformerId}\n${param}`;

/**
 * Стек деформеров и материал версий 7–9 — граф: сборки по порядку стека, материал в конце. Граф
 * рисует то же, что стек (`golden-deformers.test.ts`). Пустой стек без материала — без графа.
 */
export function graphFromLegacy(
  objectId: string,
  deformers: readonly Deformer[],
  material: GlyphMaterial | null,
  migration: DeformerMigration,
): NodeGraph | null {
  if (deformers.length === 0 && !material) return null;
  const fragments: Fragment[] = [];
  for (const d of deformers) {
    const fragment = fragmentOfDeformer(d);
    for (const [param, target] of Object.entries(fragment.params)) {
      migration.set(migrationKey(d.id, param), target);
    }
    fragments.push(fragment);
  }
  if (material) fragments.push(...fragmentsOfMaterial(objectId, material));
  return chainGraph(fragments);
}
