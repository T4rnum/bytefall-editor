import { newId } from '../document';
import { nodeSpec } from './nodes';
import { COLUMN, type Fragment } from './presets';
import {
  type GraphLink,
  type GraphNode,
  INPUT_NODE,
  type NodeGraph,
  OUTPUT_NODE,
  type OptionValue,
  type SocketType,
} from './types';

/**
 * Правка графа. Всё неизменяемо: функции возвращают новый граф, а если менять нечего — тот же.
 * Связи проверяются здесь же: тип выхода совпадает с типом входа, циклов нет, на вход — одна.
 */

export interface OutRef {
  readonly node: string;
  readonly out: string;
}
export interface InRef {
  readonly node: string;
  readonly in: string;
}

const isEndpoint = (id: string): boolean => id === INPUT_NODE || id === OUTPUT_NODE;

export function findNode(graph: NodeGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/** Тип сокета узла или null, если такого нет. */
export function socketType(
  graph: NodeGraph,
  nodeId: string,
  socket: string,
  side: 'in' | 'out',
): SocketType | null {
  const node = findNode(graph, nodeId);
  const spec = node && nodeSpec(node.kind);
  const list = side === 'in' ? spec?.inputs : spec?.outputs;
  return list?.find((s) => s.name === socket)?.type ?? null;
}

/** Достижим ли узел `target` из `start` по связям вперёд. */
function reaches(graph: NodeGraph, start: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const l of graph.links) if (l.from === id) stack.push(l.to);
  }
  return false;
}

export function canConnect(graph: NodeGraph, from: OutRef, to: InRef): boolean {
  if (from.node === to.node) return false;
  const a = socketType(graph, from.node, from.out, 'out');
  const b = socketType(graph, to.node, to.in, 'in');
  return a !== null && a === b && !reaches(graph, to.node, from.node);
}

/** Соединяет выход со входом; прежняя связь на этот вход уходит. Нельзя — граф тот же. */
export function connect(graph: NodeGraph, from: OutRef, to: InRef): NodeGraph {
  if (!canConnect(graph, from, to)) return graph;
  const links = graph.links.filter((l) => !(l.to === to.node && l.in === to.in));
  return {
    ...graph,
    links: [...links, { from: from.node, out: from.out, to: to.node, in: to.in }],
  };
}

export function disconnect(graph: NodeGraph, to: InRef): NodeGraph {
  const links = graph.links.filter((l) => !(l.to === to.node && l.in === to.in));
  return links.length === graph.links.length ? graph : { ...graph, links };
}

export function addNode(graph: NodeGraph, node: GraphNode): NodeGraph {
  return { ...graph, nodes: [...graph.nodes, node] };
}

/** Новый узел вида `kind` в точке редактора, со значениями по умолчанию. */
export function createNode(kind: string, x: number, y: number, id = newId('node')): GraphNode {
  return { id, kind, muted: false, x, y, values: {}, options: {} };
}

/**
 * Удаляет узел со связями. Узел, через который шёл поток, не рвёт его: то, что входило в узел
 * символами, уходит туда, куда узел отдавал символы, — как удаление модификатора из стека.
 * «Объект» и «Вывод» не удаляются.
 */
export function removeNode(graph: NodeGraph, id: string): NodeGraph {
  if (isEndpoint(id) || !findNode(graph, id)) return graph;
  const spec = nodeSpec(findNode(graph, id)?.kind ?? '');
  const glyphIn = spec?.inputs.find((i) => i.type === 'glyphs')?.name;
  const into = graph.links.find((l) => l.to === id && l.in === glyphIn);
  const onward = graph.links.filter(
    (l) => l.from === id && socketType(graph, id, l.out, 'out') === 'glyphs',
  );
  let next: NodeGraph = {
    nodes: graph.nodes.filter((n) => n.id !== id),
    links: graph.links.filter((l) => l.from !== id && l.to !== id),
  };
  if (into) {
    for (const l of onward)
      next = connect(next, { node: into.from, out: into.out }, { node: l.to, in: l.in });
  }
  return next;
}

function patchNode(graph: NodeGraph, id: string, fn: (n: GraphNode) => GraphNode): NodeGraph {
  let changed = false;
  const nodes = graph.nodes.map((n) => {
    if (n.id !== id) return n;
    const next = fn(n);
    changed ||= next !== n;
    return next;
  });
  return changed ? { ...graph, nodes } : graph;
}

export const moveNode = (graph: NodeGraph, id: string, x: number, y: number): NodeGraph =>
  patchNode(graph, id, (n) => (n.x === x && n.y === y ? n : { ...n, x, y }));

export const setNodeValue = (graph: NodeGraph, id: string, input: string, value: number) =>
  patchNode(graph, id, (n) =>
    n.values[input] === value ? n : { ...n, values: { ...n.values, [input]: value } },
  );

export const setNodeOption = (graph: NodeGraph, id: string, name: string, value: OptionValue) =>
  patchNode(graph, id, (n) =>
    n.options[name] === value ? n : { ...n, options: { ...n.options, [name]: value } },
  );

export const setNodeMuted = (graph: NodeGraph, id: string, muted: boolean) =>
  patchNode(graph, id, (n) => (n.muted === muted ? n : { ...n, muted }));

/**
 * Вставляет сборку в поток перед «Выводом»: то, что шло на вывод, идёт в сборку, сборка — на
 * вывод. Сборка встаёт на место вывода, а вывод отодвигается вправо.
 */
export function insertFragment(graph: NodeGraph, fragment: Fragment): NodeGraph {
  const out = findNode(graph, OUTPUT_NODE);
  if (!out) return graph;
  const feed = graph.links.find((l) => l.to === OUTPUT_NODE && l.in === 'glyphs');
  const nodes = [
    ...graph.nodes.map((n) =>
      n.id === OUTPUT_NODE ? { ...n, x: n.x + fragment.columns * COLUMN } : n,
    ),
    ...fragment.nodes.map((n) => ({ ...n, x: n.x + out.x, y: n.y + out.y })),
  ];
  const links: GraphLink[] = graph.links.filter(
    (l) => !(l.to === OUTPUT_NODE && l.in === 'glyphs'),
  );
  links.push(...fragment.links);
  if (feed) {
    for (const e of fragment.entry)
      links.push({ from: feed.from, out: feed.out, to: e.node, in: e.input });
  }
  links.push({ from: fragment.exit.node, out: fragment.exit.out, to: OUTPUT_NODE, in: 'glyphs' });
  return { nodes, links };
}

/**
 * Копия графа под новыми идентификаторами узлов — для копии объекта: ключи находят узел по
 * идентификатору, и общий у оригинала и копии двигал бы их вместе. `ids` задаёт новые снаружи,
 * чтобы копия одного объекта в разных кадрах получила одни и те же.
 */
export function copyGraph(graph: NodeGraph, ids: Map<string, string> = new Map()): NodeGraph {
  const idOf = (id: string): string => {
    if (isEndpoint(id)) return id;
    let next = ids.get(id);
    if (!next) ids.set(id, (next = newId('node')));
    return next;
  };
  return {
    nodes: graph.nodes.map((n) => ({ ...n, id: idOf(n.id) })),
    links: graph.links.map((l) => ({ ...l, from: idOf(l.from), to: idOf(l.to) })),
  };
}

/**
 * Что не так с графом, или null. Файл недоверенный: узлы известного вида, уникальные
 * идентификаторы, «Объект» и «Вывод» на месте, связи между существующими сокетами одного типа,
 * на вход не больше одной, циклов нет.
 */
export function graphProblem(graph: NodeGraph): string | null {
  const ids = new Set<string>();
  for (const n of graph.nodes) {
    if (ids.has(n.id)) return `duplicate node id ${n.id}`;
    ids.add(n.id);
    if (!nodeSpec(n.kind)) return `unknown node kind ${n.kind}`;
  }
  if (findNode(graph, INPUT_NODE)?.kind !== 'input') return 'missing input node';
  if (findNode(graph, OUTPUT_NODE)?.kind !== 'output') return 'missing output node';
  const inputs = new Set<string>();
  for (const l of graph.links) {
    const a = socketType(graph, l.from, l.out, 'out');
    const b = socketType(graph, l.to, l.in, 'in');
    if (a === null || b === null || a !== b) return `bad link ${l.from}.${l.out} → ${l.to}.${l.in}`;
    const target = `${l.to}/${l.in}`;
    if (inputs.has(target)) return `two links into ${target}`;
    inputs.add(target);
  }
  for (const l of graph.links) if (reaches(graph, l.to, l.from)) return 'cycle';
  return null;
}
