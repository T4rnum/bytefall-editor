import { socketType } from '../../../core/graph/edit';
import type { GraphLink, GraphNode, NodeGraph, SocketType } from '../../../core/graph/types';
import { type Point, linkPath, socketAt } from '../../nodes/nodeLayout';

/** Связь, которую тянут сейчас: от гнезда к указателю. */
export interface PendingLink {
  readonly from: Point;
  readonly to: Point;
  readonly type: SocketType;
}

export interface NodeLinksProps {
  readonly graph: NodeGraph;
  /** Сдвиг узла на время перетаскивания. */
  readonly offsetOf: (id: string) => Point;
  /** Связь, снятая со входа для перетаскивания: её не рисуем на старом месте. */
  readonly hidden?: GraphLink;
  readonly pending: PendingLink | null;
}

const shifted = (node: GraphNode, offset: Point): GraphNode =>
  offset.x === 0 && offset.y === 0 ? node : { ...node, x: node.x + offset.x, y: node.y + offset.y };

/**
 * Провода между узлами: слой SVG под узлами, в единицах поля. Цвет — по типу связи: поток
 * символов и числа различимы с одного взгляда.
 */
export function NodeLinks({ graph, offsetOf, hidden, pending }: NodeLinksProps) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const paths = graph.links.flatMap((link) => {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (!from || !to || link === hidden) return [];
    const a = socketAt(shifted(from, offsetOf(from.id)), 'out', link.out);
    const b = socketAt(shifted(to, offsetOf(to.id)), 'in', link.in);
    if (!a || !b) return [];
    const type = socketType(graph, link.from, link.out, 'out') ?? 'number';
    const muted = from.muted || to.muted;
    return [
      <path
        key={`${link.to}/${link.in}`}
        d={linkPath(a, b)}
        className={`node-link node-link--${type}${muted ? ' is-muted' : ''}`}
      />,
    ];
  });
  return (
    <svg className="node-links" aria-hidden="true">
      {paths}
      {pending && (
        <path
          d={linkPath(pending.from, pending.to)}
          className={`node-link node-link--${pending.type} is-pending`}
        />
      )}
    </svg>
  );
}
