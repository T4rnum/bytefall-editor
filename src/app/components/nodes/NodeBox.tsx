import type { PointerEvent as ReactPointerEvent } from 'react';
import { nodeSpec } from '../../../core/graph/nodes';
import type { GraphLink, GraphNode, NodeGraph, SocketType } from '../../../core/graph/types';
import type { SceneObject } from '../../../core/object';
import { type NodeRow, nodeRows } from '../../nodes/nodeLayout';
import { InputField, OptionField } from '../NodeFields';

export type SocketSide = 'in' | 'out';

export interface NodeBoxProps {
  readonly object: SceneObject;
  readonly graph: NodeGraph;
  readonly node: GraphNode;
  readonly selected: boolean;
  /** Сдвиг на время перетаскивания, в единицах поля. */
  readonly dx: number;
  readonly dy: number;
  readonly onHeadDown: (event: ReactPointerEvent, nodeId: string) => void;
  readonly onSocketDown: (
    event: ReactPointerEvent,
    nodeId: string,
    side: SocketSide,
    name: string,
  ) => void;
}

/** Гнездо связи. Данные в атрибутах: по ним отпускание связи находит, куда она пришла. */
function Socket({
  node,
  side,
  name,
  type,
  onDown,
}: {
  node: string;
  side: SocketSide;
  name: string;
  type: SocketType;
  onDown: NodeBoxProps['onSocketDown'];
}) {
  return (
    <span
      className={`node-socket node-socket--${side} node-socket--${type}`}
      data-node={node}
      data-side={side}
      data-socket={name}
      onPointerDown={(e) => onDown(e, node, side, name)}
    />
  );
}

function Row({
  props,
  row,
  incoming,
}: {
  props: NodeBoxProps;
  row: NodeRow;
  incoming: ReadonlyMap<string, GraphLink>;
}) {
  const { object, node, onSocketDown } = props;
  const spec = nodeSpec(node.kind);
  if (!spec) return null;
  if (row.kind === 'option') {
    const option = spec.options.find((o) => o.name === row.name);
    return (
      <div className="node-row">
        {option && <OptionField object={object} node={node} option={option} />}
      </div>
    );
  }
  const socket = (
    <Socket
      node={node.id}
      side={row.kind === 'input' ? 'in' : 'out'}
      name={row.name}
      type={row.type}
      onDown={onSocketDown}
    />
  );
  if (row.kind === 'output') {
    const label = spec.outputs.find((o) => o.name === row.name)?.label;
    return (
      <div className="node-row node-row--out">
        <span className="node-label">{label}</span>
        {socket}
      </div>
    );
  }
  const input = spec.inputs.find((i) => i.name === row.name);
  if (!input) return null;
  const free = input.type === 'number' && !incoming.has(input.name);
  return (
    <div className="node-row">
      {socket}
      {free ? (
        <InputField node={node} input={input} />
      ) : (
        <span className="node-label">{input.label}</span>
      )}
    </div>
  );
}

/**
 * Узел в редакторе: шапка цвета его рода, ряды выходов, входов и настроек. Число на свободном
 * входе правится прямо в узле и ведётся ключами, как в инспекторе.
 */
export function NodeBox(props: NodeBoxProps) {
  const { graph, node, selected, dx, dy, onHeadDown } = props;
  const spec = nodeSpec(node.kind);
  if (!spec) return null;
  const incoming = new Map(graph.links.filter((l) => l.to === node.id).map((l) => [l.in, l]));
  const classes = [
    'node',
    `node--${spec.category}`,
    selected ? 'is-selected' : '',
    node.muted ? 'is-muted' : '',
  ];
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      style={{ left: node.x + dx, top: node.y + dy }}
      data-node={node.id}
    >
      <div className="node-head" title={spec.hint} onPointerDown={(e) => onHeadDown(e, node.id)}>
        <span className="node-title">{spec.label}</span>
        {node.muted && <span className="node-muted">заглушён</span>}
      </div>
      {nodeRows(spec).map((row) => (
        <Row key={`${row.kind}:${row.name}`} props={props} row={row} incoming={incoming} />
      ))}
    </div>
  );
}
