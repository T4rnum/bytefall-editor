import { nodeImpl } from './nodes';
import {
  type GlyphPose,
  type GraphContext,
  type GraphLink,
  type GraphNode,
  INPUT_NODE,
  type NodeGraph,
  type NodeOutputs,
  type NumberSource,
  OUTPUT_NODE,
  type OptionValue,
} from './types';

/**
 * Вычисление графа: от «Вывода» назад по связям, каждый узел — один раз. Поток, который уходит
 * по нескольким связям, каждый потребитель получает своей копией: действия меняют символы на
 * месте, и ветки не должны видеть правок друг друга. Недостижимые из вывода узлы не считаются.
 */

interface Plan {
  readonly byId: ReadonlyMap<string, GraphNode>;
  /** Связи на входы каждого узла: узел → вход → связь. Ключи готовы заранее: кадр их не клеит. */
  readonly inputs: ReadonlyMap<string, ReadonlyMap<string, GraphLink>>;
  /** Связи с выхода, который уходит не только в них: поток по ним копируется. */
  readonly shared: ReadonlySet<GraphLink>;
}

const plans = new WeakMap<NodeGraph, Plan>();
const NO_INPUTS: ReadonlyMap<string, GraphLink> = new Map();

function planOf(graph: NodeGraph): Plan {
  let plan = plans.get(graph);
  if (!plan) {
    const inputs = new Map<string, Map<string, GraphLink>>();
    const fanout = new Map<string, GraphLink[]>();
    for (const link of graph.links) {
      let own = inputs.get(link.to);
      if (!own) inputs.set(link.to, (own = new Map<string, GraphLink>()));
      own.set(link.in, link);
      const out = `${link.from}/${link.out}`;
      fanout.set(out, [...(fanout.get(out) ?? []), link]);
    }
    const shared = new Set([...fanout.values()].filter((l) => l.length > 1).flat());
    plan = { byId: new Map(graph.nodes.map((n) => [n.id, n])), inputs, shared };
    plans.set(graph, plan);
  }
  return plan;
}

/** Связь на вход `input` узла `id`. */
const linkInto = (plan: Plan, id: string, input: string): GraphLink | undefined =>
  plan.inputs.get(id)?.get(input);

const clone = (p: GlyphPose): GlyphPose => ({ ...p });

/**
 * Символы после графа. `source` — символы объекта; массив и позы принадлежат вычислителю и
 * меняются на месте. Граф без вывода или с циклом отдаёт символы объекта как есть.
 */
export function evaluateGraph(
  graph: NodeGraph,
  source: GlyphPose[],
  ctx: GraphContext,
): GlyphPose[] {
  const plan = planOf(graph);
  const done = new Map<string, NodeOutputs>();
  const visiting = new Set<string>();

  const outputsOf = (id: string): NodeOutputs | null => {
    const known = done.get(id);
    if (known) return known;
    const node = plan.byId.get(id);
    if (!node || visiting.has(id)) return null;
    visiting.add(id);
    const outputs = runNode(node);
    visiting.delete(id);
    done.set(id, outputs);
    return outputs;
  };

  const upstream = (link: GraphLink | undefined): unknown =>
    link ? outputsOf(link.from)?.[link.out] : undefined;

  const runNode = (node: GraphNode): NodeOutputs => {
    if (node.id === INPUT_NODE) return { glyphs: source };
    const impl = nodeImpl(node.kind);
    if (!impl) return {};
    const { spec } = impl;
    const links = plan.inputs.get(node.id) ?? NO_INPUTS;
    const glyphs = (name: string): GlyphPose[] => {
      const link = links.get(name);
      const value = upstream(link);
      if (!link || !Array.isArray(value)) return [];
      // Поток, который уходит не только сюда, копируется: ветки не делят символы.
      return plan.shared.has(link) ? value.map(clone) : (value as GlyphPose[]);
    };
    if (node.muted) {
      // Выключенное действие пропускает поток, выключенный генератор ничего не рождает.
      const first = spec.inputs.find((i) => i.type === 'glyphs');
      const through = spec.category === 'generator' || !first ? [] : glyphs(first.name);
      return Object.fromEntries(
        spec.outputs.map((o) => [o.name, o.type === 'glyphs' ? through : 0]),
      );
    }
    const num = (name: string): NumberSource => {
      const value = upstream(links.get(name));
      if (typeof value === 'number' || typeof value === 'function') return value as NumberSource;
      return node.values[name] ?? spec.inputs.find((i) => i.name === name)?.default ?? 0;
    };
    const option = <T extends OptionValue>(name: string): T => {
      const own = node.options[name];
      if (own !== undefined) return own as T;
      const optionSpec = spec.options.find((o) => o.name === name);
      return (optionSpec && 'default' in optionSpec ? optionSpec.default : []) as T;
    };
    return impl.run({ node, ctx, num, glyphs, option });
  };

  const out = plan.byId.get(OUTPUT_NODE);
  if (!out) return source;
  const result = outputsOf(OUTPUT_NODE)?.glyphs;
  return Array.isArray(result) ? result : source;
}

/**
 * Меняется ли картинка графа со временем. Считаются только узлы, достижимые из вывода: узел,
 * висящий сбоку, ничего не рисует. Выключенный узел — не движение.
 */
export function isAnimatedGraph(graph: NodeGraph): boolean {
  const plan = planOf(graph);
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    const node = plan.byId.get(id);
    if (!node) return false;
    const impl = nodeImpl(node.kind);
    const linked = (input: string): boolean => linkInto(plan, id, input) !== undefined;
    if (node.muted) {
      // Выключенное действие смотрит только на поток, который пропускает; генератор — ни на что.
      if (!impl || impl.spec.category === 'generator') return false;
      const through = impl.spec.inputs.find((i) => i.type === 'glyphs');
      const link = through && linkInto(plan, id, through.name);
      return link ? visit(link.from) : false;
    }
    if (impl?.animated?.(node, linked)) return true;
    return graph.links.some((l) => l.to === id && visit(l.from));
  };
  return visit(OUTPUT_NODE);
}

/**
 * Граф, который ничего не делает: символы объекта идут на вывод прямо или сквозь выключенные
 * действия.
 */
export function isIdentityGraph(graph: NodeGraph): boolean {
  const plan = planOf(graph);
  const seen = new Set<string>();
  let feed = linkInto(plan, OUTPUT_NODE, 'glyphs');
  while (feed && feed.from !== INPUT_NODE && !seen.has(feed.from)) {
    seen.add(feed.from);
    const node = plan.byId.get(feed.from);
    const spec = node?.muted ? nodeImpl(node.kind)?.spec : undefined;
    if (!spec || spec.category === 'generator') return false;
    const through = spec.inputs.find((i) => i.type === 'glyphs');
    feed = through && linkInto(plan, feed.from, through.name);
  }
  return feed !== undefined && feed.from === INPUT_NODE && feed.out === 'glyphs';
}
