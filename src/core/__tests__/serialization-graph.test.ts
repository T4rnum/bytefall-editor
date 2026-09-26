import { describe, expect, it } from 'vitest';
import { MAX_GRAPH_NODES } from '../format/graph';
import { deserialize } from '../serialization';
import v10 from './fixtures/v10-graph.bp.json?raw';

/** Файл с графом, чтобы портить его по частям. */
type File = {
  frames: {
    objects: { graph: { nodes: Record<string, unknown>[]; links: Record<string, unknown>[] } }[];
  }[];
  tracks: Record<string, unknown>[];
};

function graphFile(): File {
  return JSON.parse(v10) as File;
}

const graphOf = (file: File) => file.frames[0].objects[0].graph;
const nodeOf = (file: File, id: string) => graphOf(file).nodes.find((n) => n.id === id)!;
const load = (file: File) => () => deserialize(JSON.stringify(file));

describe('граф в файле', () => {
  it('узел неизвестного вида или без входа или вывода файл не пройдёт', () => {
    const unknown = graphFile();
    nodeOf(unknown, 'node-join').kind = 'teleport';
    expect(load(unknown)).toThrow(/unknown node kind teleport/);
    const second = graphFile();
    nodeOf(second, 'node-join').kind = 'input';
    expect(load(second)).toThrow(/misplaced input/);
    const orphan = graphFile();
    graphOf(orphan).nodes = graphOf(orphan).nodes.filter((n) => n.id !== 'out');
    expect(load(orphan)).toThrow(/output/);
  });

  it('числа входов — только свои и в пределах вида узла, настройки — своего типа', () => {
    const foreign = graphFile();
    nodeOf(foreign, 'node-offset').values = { radius: 1 };
    expect(load(foreign)).toThrow(/no number input radius/);
    const far = graphFile();
    nodeOf(far, 'node-offset').values = { strength: 1000 };
    expect(load(far)).toThrow(/strength is out of range/);
    const rate = graphFile();
    nodeOf(rate, 'node-sparks').options = { rate: 1000 };
    expect(load(rate)).toThrow(/bad option rate/);
    const color = graphFile();
    nodeOf(color, 'node-glow').options = { color: 'blue' };
    expect(load(color)).toThrow(/bad option color/);
    const pivot = graphFile();
    nodeOf(pivot, 'node-spin').options = { pivot: 'moon' };
    expect(load(pivot)).toThrow(/bad option pivot/);
  });

  it('связь — только выход в вход того же типа, по одной на вход и без циклов', () => {
    const mixed = graphFile();
    graphOf(mixed).links.push({ from: 'node-pos', out: 'y', to: 'node-join', in: 'a' });
    expect(load(mixed)).toThrow(/bad link|two links/);
    const typed = graphFile();
    graphOf(typed).links[0] = { from: 'in', out: 'glyphs', to: 'node-wave', in: 'value' };
    expect(load(typed)).toThrow(/bad link in\.glyphs/);
    const twice = graphFile();
    graphOf(twice).links.push({ from: 'node-pos', out: 'y', to: 'node-offset', in: 'y' });
    expect(load(twice)).toThrow(/two links into node-offset\/y/);
    const loop = graphFile();
    graphOf(loop).links[2] = { from: 'node-spin', out: 'glyphs', to: 'node-offset', in: 'glyphs' };
    expect(load(loop)).toThrow(/cycle/);
  });

  it('узлов не больше предела, ключи — только на числовые входы узлов', () => {
    const crowd = graphFile();
    for (let i = 0; i < MAX_GRAPH_NODES; i++) {
      graphOf(crowd).nodes.push({ id: `extra-${i}`, kind: 'time', x: 0, y: 0 });
    }
    expect(load(crowd)).toThrow();
    const option = graphFile();
    option.tracks[0].property = 'pivot';
    option.tracks[0].id = 'node-spin';
    expect(load(option)).toThrow(/Unknown node property: pivot/);
    const missing = graphFile();
    missing.tracks[0].id = 'node-gone';
    expect(load(missing)).toThrow(/Unknown node property/);
    const far = graphFile();
    far.tracks[0].keys = [{ t: 0, v: 1e9 }];
    expect(load(far)).toThrow(/out of range/);
  });
});
