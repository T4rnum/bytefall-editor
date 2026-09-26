import type { InRef, OutRef } from '../../../core/graph/edit';
import type { GraphLink, NodeGraph } from '../../../core/graph/types';
import { type Box, type Point, nodesInBox } from '../../nodes/nodeLayout';
import { useEditorStore } from '../../store/editorStore';
import { disconnectAction, linkAction, moveNodesAction } from '../../store/graphActions';
import type { SocketSide } from './NodeBox';

/** Что тянут сейчас: узлы, связь или рамку выделения. Для отрисовки предпросмотра. */
export type NodeDrag =
  | {
      readonly kind: 'move';
      readonly ids: readonly string[];
      readonly dx: number;
      readonly dy: number;
    }
  | {
      readonly kind: 'link';
      readonly from?: OutRef;
      readonly to?: InRef;
      /** Связь, снятая со входа: тянут её дальше, а отпускание мимо гнезда её убирает. */
      readonly detached?: GraphLink;
      readonly at: Point;
    }
  | { readonly kind: 'box'; readonly box: Box }
  | null;

type LinkDrag = Extract<NonNullable<NodeDrag>, { kind: 'link' }>;

export const boxOf = (a: Point, b: Point): Box => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

/**
 * Связь из гнезда: с выхода — новая; со связанного входа — снятая и несомая дальше, как в
 * Blender; со свободного входа — новая в обратную сторону, к выходу.
 */
export function linkDragFrom(
  graph: NodeGraph,
  node: string,
  side: SocketSide,
  name: string,
  at: Point,
): LinkDrag {
  if (side === 'out') return { kind: 'link', from: { node, out: name }, at };
  const existing = graph.links.find((l) => l.to === node && l.in === name);
  if (!existing) return { kind: 'link', to: { node, in: name }, at };
  return { kind: 'link', from: { node: existing.from, out: existing.out }, detached: existing, at };
}

/** Выделение по щелчку в шапку: Shift добавляет и снимает, без него — узел, если он не выбран. */
export function headSelection(selected: readonly string[], id: string, shift: boolean): string[] {
  if (shift) return selected.includes(id) ? selected.filter((n) => n !== id) : [...selected, id];
  return selected.includes(id) ? [...selected] : [id];
}

/** Гнездо под точкой экрана: по атрибутам, которые ставит `NodeBox`. */
function socketUnder(x: number, y: number) {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-socket]');
  const { node, side, socket } = el?.dataset ?? {};
  return node && socket && (side === 'in' || side === 'out') ? { node, side, name: socket } : null;
}

/** Связь отпустили: над подходящим гнездом она встаёт, мимо — снятая со входа уходит. */
function dropLink(objectId: string, d: LinkDrag, x: number, y: number): void {
  const target = socketUnder(x, y);
  const detached = d.detached && { node: d.detached.to, in: d.detached.in };
  if (d.from && target?.side === 'in') {
    const same = detached?.node === target.node && detached.in === target.name;
    if (!same) linkAction(objectId, d.from, { node: target.node, in: target.name }, detached);
  } else if (d.to && target?.side === 'out') {
    linkAction(objectId, { node: target.node, out: target.name }, d.to);
  } else if (detached) {
    disconnectAction(objectId, detached);
  }
}

/**
 * Жест закончен: узлы встают на новые места, рамка выделяет задетые, связь встаёт или уходит.
 * Правка документа — одна запись истории на жест. `x`, `y` — где отпустили, на экране.
 */
export function commitDrag(
  objectId: string,
  graph: NodeGraph,
  d: NonNullable<NodeDrag>,
  at: { readonly x: number; readonly y: number; readonly additive: boolean },
): void {
  if (d.kind === 'move') {
    if (d.dx === 0 && d.dy === 0) return;
    const moves = graph.nodes
      .filter((n) => d.ids.includes(n.id))
      .map((n) => ({ id: n.id, x: Math.round(n.x + d.dx), y: Math.round(n.y + d.dy) }));
    moveNodesAction(objectId, moves);
  } else if (d.kind === 'box') {
    const hit = nodesInBox(graph, d.box);
    const editor = useEditorStore.getState();
    editor.setSelectedNodes(at.additive ? [...new Set([...editor.selectedNodes, ...hit])] : hit);
  } else {
    dropLink(objectId, d, at.x, at.y);
  }
}
