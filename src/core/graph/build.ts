import { COLUMN, type Fragment, ROW } from './presets';
import { type GraphLink, type GraphNode, INPUT_NODE, type NodeGraph, OUTPUT_NODE } from './types';

/** Пустой граф: символы объекта сразу на вывод. */
export function emptyGraph(): NodeGraph {
  return chainGraph([]);
}

const endpoint = (id: string, kind: 'input' | 'output', col: number): GraphNode => ({
  id,
  kind,
  muted: false,
  x: col * COLUMN,
  y: 0,
  values: {},
  options: {},
});

/** Сборка, сдвинутая на `col` столбцов редактора. */
function shifted(fragment: Fragment, col: number): readonly GraphNode[] {
  return fragment.nodes.map((n) => ({ ...n, x: n.x + col * COLUMN, y: n.y }));
}

/**
 * Цепочка сборок в граф: объект → сборки по порядку → вывод. Так мигрирует стек деформеров, и
 * так же выглядит граф, собранный меню «Добавить», пока его не перестроили руками.
 */
export function chainGraph(fragments: readonly Fragment[]): NodeGraph {
  const nodes: GraphNode[] = [endpoint(INPUT_NODE, 'input', 0)];
  const links: GraphLink[] = [];
  let stream = { node: INPUT_NODE, out: 'glyphs' };
  let col = 1;
  for (const fragment of fragments) {
    nodes.push(...shifted(fragment, col));
    links.push(...fragment.links);
    for (const entry of fragment.entry) {
      links.push({ from: stream.node, out: stream.out, to: entry.node, in: entry.input });
    }
    stream = fragment.exit;
    col += fragment.columns;
  }
  nodes.push({ ...endpoint(OUTPUT_NODE, 'output', col), y: 0 * ROW });
  links.push({ from: stream.node, out: stream.out, to: OUTPUT_NODE, in: 'glyphs' });
  return { nodes, links };
}
