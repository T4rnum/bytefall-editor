import { describe, expect, it } from 'vitest';
import { createDeformer } from '../graph/legacy';
import { chainGraph, emptyGraph } from '../graph/build';
import {
  addNode,
  canConnect,
  connect,
  copyGraph,
  createNode,
  disconnect,
  graphProblem,
  insertFragment,
  removeNode,
  setNodeMuted,
  setNodeValue,
} from '../graph/edit';
import { evaluateGraph } from '../graph/evaluate';
import { fragmentOfDeformer, fragmentsOfMaterial } from '../graph/presets';
import { INPUT_NODE, OUTPUT_NODE } from '../graph/types';
import { ROWS_CENTER, poseRows } from './helpers/poseScene';

const ctx = { time: 0, center: ROWS_CENTER, cells: new Map() };

describe('правка графа', () => {
  it('связь только между сокетами одного типа и без циклов, на вход — одна', () => {
    let g = addNode(emptyGraph(), createNode('offset', 0, 0, 'off'));
    g = addNode(g, createNode('distance', 0, 0, 'dist'));
    expect(canConnect(g, { node: 'dist', out: 'value' }, { node: 'off', in: 'glyphs' })).toBe(
      false,
    );
    expect(canConnect(g, { node: 'dist', out: 'value' }, { node: 'off', in: 'x' })).toBe(true);
    g = connect(g, { node: INPUT_NODE, out: 'glyphs' }, { node: 'off', in: 'glyphs' });
    g = connect(g, { node: 'off', out: 'glyphs' }, { node: OUTPUT_NODE, in: 'glyphs' });
    expect(g.links.filter((l) => l.to === OUTPUT_NODE)).toEqual([
      { from: 'off', out: 'glyphs', to: OUTPUT_NODE, in: 'glyphs' },
    ]);
    // Цикл: вывод сдвига обратно на его же вход через второй сдвиг.
    g = addNode(g, createNode('offset', 0, 0, 'off2'));
    g = connect(g, { node: 'off', out: 'glyphs' }, { node: 'off2', in: 'glyphs' });
    expect(canConnect(g, { node: 'off2', out: 'glyphs' }, { node: 'off', in: 'glyphs' })).toBe(
      false,
    );
    expect(graphProblem(g)).toBeNull();
    expect(disconnect(g, { node: 'off2', in: 'glyphs' }).links).toHaveLength(g.links.length - 1);
  });

  it('удаление узла из потока не рвёт поток', () => {
    const g = chainGraph([fragmentOfDeformer(createDeformer('bend', 'b'))]);
    const without = removeNode(g, 'b~bend');
    expect(without.links).toEqual([
      { from: INPUT_NODE, out: 'glyphs', to: OUTPUT_NODE, in: 'glyphs' },
    ]);
    expect(removeNode(g, OUTPUT_NODE)).toBe(g);
  });

  it('сборка встаёт перед выводом, вывод отъезжает вправо', () => {
    const g = insertFragment(
      emptyGraph(),
      fragmentsOfMaterial('o', {
        outline: null,
        glow: { color: '#ffffff', radius: 0.5, strength: 1 },
        shine: null,
        dither: null,
      })[0],
    );
    expect(graphProblem(g)).toBeNull();
    const out = evaluateGraph(g, poseRows(), ctx);
    expect(out[0].material?.glow?.radius).toBe(0.5);
    expect(g.nodes.find((n) => n.id === OUTPUT_NODE)!.x).toBeGreaterThan(
      g.nodes.find((n) => n.id === 'o~glow')!.x,
    );
  });

  it('копия — новые идентификаторы узлов, те же связи; вход и выход на месте', () => {
    const g = chainGraph([fragmentOfDeformer(createDeformer('jitter', 'j'))]);
    const ids = new Map<string, string>();
    const copy = copyGraph(g, ids);
    expect(copy.nodes.some((n) => n.id === 'j~noise')).toBe(false);
    expect(ids.get('j~noise')).toBeDefined();
    expect(copy.nodes.map((n) => n.id)).toContain(INPUT_NODE);
    expect(graphProblem(copy)).toBeNull();
    expect(copyGraph(g, ids)).toEqual(copy);
  });

  it('выключенное действие пропускает поток, числа правятся по входам', () => {
    let g = chainGraph([fragmentOfDeformer(createDeformer('scaleFalloff', 's'))]);
    g = setNodeValue(g, 's~range', 'toMin', 3);
    const scaled = evaluateGraph(g, poseRows(), ctx);
    expect(scaled[0].sx).toBeGreaterThan(1);
    const off = evaluateGraph(setNodeMuted(g, 's~scale', true), poseRows(), ctx);
    expect(off.every((p) => p.sx === 1)).toBe(true);
  });

  it('проблемы файла: чужой вид, два входа, цикл, нет вывода', () => {
    const g = emptyGraph();
    expect(graphProblem({ ...g, nodes: [...g.nodes, createNode('nope', 0, 0, 'x')] })).toMatch(
      /unknown/,
    );
    expect(graphProblem({ ...g, links: [...g.links, { ...g.links[0] }] })).toMatch(/two links/);
    expect(graphProblem({ ...g, nodes: g.nodes.filter((n) => n.id !== OUTPUT_NODE) })).toMatch(
      /bad link|missing/,
    );
  });
});
