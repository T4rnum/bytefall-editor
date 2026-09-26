import { Plus, Workflow, X } from 'lucide-react';
import { useState } from 'react';
import { nodeSpec } from '../../core/graph/nodes';
import { PRESETS, type PresetKind } from '../../core/graph/presetMenu';
import {
  type GraphLink,
  type GraphNode,
  INPUT_NODE,
  type NodeGraph,
  OUTPUT_NODE,
} from '../../core/graph/types';
import type { SceneObject } from '../../core/object';
import { addPresetAction, removeNodeAction, setNodeMutedAction } from '../store/graphActions';
import { useUiStore } from '../store/uiStore';
import { Button, Checkbox, Field, Select, type SelectOption, plural } from '../ui';
import { OBJECTS, useGroupTargets } from './groupTargets';
import { InputField, OptionField } from './NodeFields';

const PRESET_OPTIONS: readonly SelectOption<PresetKind>[] = PRESETS.map((p) => ({
  value: p.kind,
  label: `${p.group}: ${p.label}`,
}));

/** Узлы по месту в редакторе — слева направо, как течёт поток. Вход и вывод не показываются. */
const orderedNodes = (graph: NodeGraph): GraphNode[] =>
  graph.nodes
    .filter((n) => n.id !== INPUT_NODE && n.id !== OUTPUT_NODE)
    .sort((a, b) => a.x - b.x || a.y - b.y);

/** Откуда пришло число: имя узла, а у узла с несколькими выходами — ещё и выход. */
function sourceLabel(graph: NodeGraph, link: GraphLink): string {
  const from = graph.nodes.find((n) => n.id === link.from);
  const spec = from && nodeSpec(from.kind);
  if (!spec) return '?';
  const out = spec.outputs.length > 1 ? spec.outputs.find((o) => o.name === link.out) : undefined;
  return out ? `${spec.label} · ${out.label}` : spec.label;
}

function NodeItem({
  object,
  graph,
  node,
}: {
  object: SceneObject;
  graph: NodeGraph;
  node: GraphNode;
}) {
  const spec = nodeSpec(node.kind);
  if (!spec) return null;
  const incoming = new Map(graph.links.filter((l) => l.to === node.id).map((l) => [l.in, l]));
  const mutable = spec.category !== 'field';
  return (
    <li className="fx-row">
      <div className="fx-head">
        {mutable ? (
          <Checkbox
            checked={!node.muted}
            onChange={(on) => setNodeMutedAction(object.id, node.id, !on)}
          >
            {spec.label}
          </Checkbox>
        ) : (
          <span className="fx-title" title={spec.hint}>
            {spec.label}
          </span>
        )}
        <Button
          icon
          size="sm"
          variant="danger"
          label="Убрать узел: поток через него не рвётся"
          onClick={() => removeNodeAction(object.id, node.id)}
        >
          <X size={14} />
        </Button>
      </div>
      {spec.inputs
        .filter((input) => input.type === 'number')
        .map((input) => {
          const link = incoming.get(input.name);
          return link ? (
            <Field key={input.name} label={input.label}>
              <span className="dim">← {sourceLabel(graph, link)}</span>
            </Field>
          ) : (
            <InputField key={input.name} node={node} input={input} />
          );
        })}
      {spec.options.map((option) => (
        <OptionField key={option.name} object={object} node={node} option={option} />
      ))}
    </li>
  );
}

/**
 * Узлы объекта списком: что делается с его символами по пути на экран. Меню «Добавить» ставит
 * готовую сборку перед выводом — всем выбранным объектам разом. Устройство графа — в редакторе
 * узлов; здесь — числа и настройки.
 */
export function GraphFields({ object }: { readonly object: SceneObject }) {
  const [kind, setKind] = useState<PresetKind>('wave');
  const targets = useGroupTargets(object.id);
  const graph = object.graph;
  const nodes = graph ? orderedNodes(graph) : [];
  return (
    <>
      <div className="keyed">
        <Select
          value={kind}
          options={PRESET_OPTIONS}
          size="sm"
          ariaLabel="Какую сборку добавить"
          onChange={setKind}
        />
        <Button
          icon
          size="sm"
          label={
            targets.length > 1
              ? `Добавить всем выбранным: ${plural(targets.length, OBJECTS)}`
              : 'Добавить объекту: встанет в поток перед выводом'
          }
          onClick={() => addPresetAction(targets, kind)}
        >
          <Plus size={14} />
        </Button>
        <Button
          icon
          size="sm"
          label="Граф узлов внизу: связи, ветки, свои цепочки"
          hotkey="N"
          onClick={() => useUiStore.getState().setBottomView('nodes')}
        >
          <Workflow size={14} />
        </Button>
      </div>
      {graph && nodes.length > 0 && (
        <ul className="fx-list">
          {nodes.map((node) => (
            <NodeItem key={node.id} object={object} graph={graph} node={node} />
          ))}
        </ul>
      )}
    </>
  );
}
