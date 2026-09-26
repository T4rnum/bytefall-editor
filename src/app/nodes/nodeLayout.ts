import { nodeSpec } from '../../core/graph/nodes';
import type { GraphNode, NodeGraph, NodeSpec, SocketType } from '../../core/graph/types';

/**
 * Геометрия узла в редакторе узлов, в единицах поля: поле масштабируется целиком, поэтому узел
 * всегда одной ширины. Ряды идут как в Blender: сверху выходы, под ними входы, внизу настройки.
 * Разметка узла и гнёзда связей считаются отсюда же, поэтому линия связи приходит ровно в гнездо.
 */

export const NODE_WIDTH = 200;
export const HEADER_HEIGHT = 26;
export const ROW_HEIGHT = 26;
/** Отступ под последним рядом. */
export const NODE_PAD = 6;

export type NodeRow =
  | { readonly kind: 'output'; readonly name: string; readonly type: SocketType }
  | { readonly kind: 'input'; readonly name: string; readonly type: SocketType }
  | { readonly kind: 'option'; readonly name: string };

const rowCache = new WeakMap<NodeSpec, readonly NodeRow[]>();

/** Ряды узла сверху вниз. */
export function nodeRows(spec: NodeSpec): readonly NodeRow[] {
  let rows = rowCache.get(spec);
  if (!rows) {
    rows = [
      ...spec.outputs.map((o) => ({ kind: 'output' as const, name: o.name, type: o.type })),
      ...spec.inputs.map((i) => ({ kind: 'input' as const, name: i.name, type: i.type })),
      ...spec.options.map((o) => ({ kind: 'option' as const, name: o.name })),
    ];
    rowCache.set(spec, rows);
  }
  return rows;
}

export const nodeHeight = (spec: NodeSpec): number =>
  HEADER_HEIGHT + nodeRows(spec).length * ROW_HEIGHT + NODE_PAD;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Гнездо входа слева или выхода справа, по середине его ряда. Нет такого — null. */
export function socketAt(node: GraphNode, side: 'in' | 'out', name: string): Point | null {
  const spec = nodeSpec(node.kind);
  if (!spec) return null;
  const kind = side === 'in' ? 'input' : 'output';
  const index = nodeRows(spec).findIndex((r) => r.kind === kind && r.name === name);
  if (index < 0) return null;
  return {
    x: node.x + (side === 'in' ? 0 : NODE_WIDTH),
    y: node.y + HEADER_HEIGHT + (index + 0.5) * ROW_HEIGHT,
  };
}

/**
 * Кривая связи от выхода `a` ко входу `b`: касательные горизонтальные, как у проводов в Blender.
 * Связь назад, справа налево, выгибается петлёй, а не режет узел поперёк.
 */
export function linkPath(a: Point, b: Point): string {
  const reach = Math.max(48, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + reach} ${a.y}, ${b.x - reach} ${b.y}, ${b.x} ${b.y}`;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Габарит узлов графа, а с `ids` — только этих; пусто — null. */
export function nodesBounds(graph: NodeGraph, ids?: ReadonlySet<string>): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    const spec = nodeSpec(node.kind);
    if (!spec || (ids && !ids.has(node.id))) continue;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + NODE_WIDTH);
    maxY = Math.max(maxY, node.y + nodeHeight(spec));
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Узлы, которые задевает рамка: хоть краем. */
export function nodesInBox(graph: NodeGraph, box: Box): string[] {
  return graph.nodes
    .filter((node) => {
      const spec = nodeSpec(node.kind);
      if (!spec) return false;
      return (
        node.x < box.x + box.width &&
        node.x + NODE_WIDTH > box.x &&
        node.y < box.y + box.height &&
        node.y + nodeHeight(spec) > box.y
      );
    })
    .map((n) => n.id);
}
