import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { composite } from '../compositor';
import { createDocument, updateLayer } from '../document';
import { createEffect } from '../effects';
import { chainGraph } from '../graph/build';
import { graphProblem, insertFragment } from '../graph/edit';
import { evaluateGraph, isAnimatedGraph } from '../graph/evaluate';
import { NODES } from '../graph/nodes';
import { PRESETS, presetFragment } from '../graph/presetMenu';
import type { GlyphPose, OptionValue } from '../graph/types';
import { keyOf } from '../grid';
import { addObject, createObject } from '../object';
import { bufferToText } from '../text';
import { wired } from './helpers/graphs';
import { ROWS_CENTER, poseRows } from './helpers/poseScene';

const ctx = (time = 0) => ({ time, center: ROWS_CENTER, cells: new Map() });
const run = (g: ReturnType<typeof wired>, time = 0, poses: GlyphPose[] = poseRows()) =>
  evaluateGraph(g, poses, ctx(time));

/** Строка из восьми «A» в (2, 8) холста 16×12: слоем или объектом в начале координат. */
function row(asObject: boolean) {
  const base = createDocument({ width: 16, height: 12, background: null });
  const cells = new Map(Array.from({ length: 8 }, (_, i) => [keyOf(2 + i, 8), makeCell('A')]));
  const layerId = base.layers[0].id;
  if (!asObject) {
    return updateLayer(base, layerId, { cells, effects: [createEffect('fire', 'fx')] });
  }
  // Зерно 0 — как у огня слоя: сборка сама даёт каждому объекту своё.
  const fire = presetFragment('fire', 'f');
  const nodes = fire.nodes.map((n) => (n.kind === 'fire' ? { ...n, options: { seed: 0 } } : n));
  const graph = chainGraph([{ ...fire, nodes }]);
  const obj = createObject({ id: 'o', name: 'o', layerId, x: 0, y: 0, cells });
  return addObject(base, { ...obj, graph });
}

describe('огонь на объекте', () => {
  it('по умолчанию совпадает с огнём слоя ячейка в ячейку: символы и цвета', () => {
    for (const time of [0, 450, 1234]) {
      const layer = composite(row(false), null, undefined, [], time);
      const object = composite(row(true), null, undefined, [], time);
      expect(bufferToText(object)).toBe(bufferToText(layer));
      expect([...object.fg]).toEqual([...layer.fg]);
    }
  });

  it('ветер сносит языки, затухание их укорачивает, искры встают над пламенем', () => {
    const g = (values: Record<string, number>) => {
      const base = wired(
        [['fire', 'fire']],
        ['in.glyphs → fire.glyphs', 'fire.glyphs → out.glyphs'],
      );
      return {
        ...base,
        nodes: base.nodes.map((n) => (n.id === 'fire' ? { ...n, values } : n)),
      };
    };
    const calm = run(g({}), 500);
    const windy = run(g({ wind: 2 }), 500);
    const mean = (ps: GlyphPose[]) => ps.reduce((s, p) => s + p.x, 0) / ps.length;
    expect(mean(windy)).toBeGreaterThan(mean(calm) + 2);
    const top = (ps: GlyphPose[]) => Math.min(...ps.map((p) => p.y));
    expect(top(run(g({ decay: 4 }), 500))).toBeGreaterThan(top(calm));
    const sparks = run(g({ sparks: 1 }), 500);
    expect(sparks.length).toBeGreaterThan(calm.length);
    // Пламя не встаёт на символы формы и живёт по тактам: внутри такта кадр тот же.
    const own = new Set(poseRows().map((p) => `${Math.floor(p.x)},${Math.floor(p.y)}`));
    expect(calm.every((p) => !own.has(`${Math.floor(p.x)},${Math.floor(p.y)}`))).toBe(true);
    expect(run(g({}), 500)).toEqual(run(g({}), 520));
    expect(isAnimatedGraph(g({}))).toBe(true);
    expect(isAnimatedGraph(g({ period: 0 }))).toBe(false);
  });
});

describe('свет, символ по кругу, шум пятнами', () => {
  it('свет умножает яркость с потолком и непрозрачность', () => {
    const g = wired(
      [['light', 'light']],
      ['in.glyphs → light.glyphs', 'light.glyphs → out.glyphs'],
    );
    const lit = (values: Record<string, number>) =>
      run({ ...g, nodes: g.nodes.map((n) => (n.id === 'light' ? { ...n, values } : n)) });
    const [plain] = run(g);
    const [bright] = lit({ brightness: 2 });
    expect(bright.fg.r).toBeCloseTo(Math.min(1, plain.fg.r * 2), 9);
    expect(bright.fg.a).toBe(plain.fg.a);
    const [faded] = lit({ opacity: 0.25 });
    expect(faded.fg.a).toBeCloseTo(plain.fg.a * 0.25, 9);
    expect(faded.fg.r).toBe(plain.fg.r);
  });

  it('ряд символов по кругу идёт с начала, у края — держит крайний', () => {
    const g = (overflow: string) => {
      const base = wired(
        [
          ['k', 'value'],
          ['glyph', 'glyph'],
        ],
        ['in.glyphs → glyph.glyphs', 'k.value → glyph.factor', 'glyph.glyphs → out.glyphs'],
      );
      return {
        ...base,
        nodes: base.nodes.map((n) =>
          n.id === 'k'
            ? { ...n, values: { value: 1.25 } }
            : n.id === 'glyph'
              ? { ...n, options: { ramp: 'abcd', overflow } }
              : n,
        ),
      };
    };
    expect(run(g('repeat'))[0].glyph).toBe('b');
    expect(run(g('clamp'))[0].glyph).toBe('d');
  });

  it('шум крупного масштаба меняется от ячейки к ячейке плавно, плавный — и во времени', () => {
    const noise = (values: Record<string, number>, motion = 'step') => {
      const base = wired(
        [
          ['n', 'noise'],
          ['off', 'offset'],
        ],
        ['in.glyphs → off.glyphs', 'n.x → off.x', 'off.glyphs → out.glyphs'],
      );
      return {
        ...base,
        nodes: base.nodes.map((n) => (n.id === 'n' ? { ...n, values, options: { motion } } : n)),
      };
    };
    const shift = (g: ReturnType<typeof noise>, time: number) =>
      run(g, time).map((p, i) => p.x - poseRows()[i].x);
    const jumps = (xs: number[]) => Math.max(...xs.slice(1, 6).map((x, i) => Math.abs(x - xs[i])));
    expect(jumps(shift(noise({ scale: 16 }), 0))).toBeLessThan(0.3);
    expect(jumps(shift(noise({}), 0))).toBeGreaterThan(0.3);
    const flow = noise({ period: 1000 }, 'flow');
    const drift = shift(flow, 510).map((x, i) => Math.abs(x - shift(flow, 500)[i]));
    expect(Math.max(...drift)).toBeLessThan(0.1);
    expect(shift(noise({ period: 1000 }), 999)).toEqual(shift(noise({ period: 1000 }), 0));
  });
});

describe('генерация', () => {
  const one = (): GlyphPose[] => [poseRows()[0]];
  const gen = (kind: string, options: Record<string, OptionValue> = {}, values = {}) => {
    const base = wired([['g', kind]], ['in.glyphs → g.glyphs', 'g.glyphs → out.glyphs']);
    return {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'g' ? { ...n, options, values } : n)),
    };
  };

  it('контур обходит форму снаружи: квадратом — восемь соседей, срезанным — четыре', () => {
    expect(run(gen('contour'), 0, one())).toHaveLength(8);
    expect(run(gen('contour', { corners: 'round' }), 0, one())).toHaveLength(4);
    expect(run(gen('contour', {}, { thickness: 2 }), 0, one())).toHaveLength(24);
    const ring = run(gen('contour'));
    const own = new Set(poseRows().map((p) => `${p.x},${p.y}`));
    expect(ring.every((p) => !own.has(`${p.x},${p.y}`) && p.glyph === '+')).toBe(true);
    // Две строки по шесть: рамка 8×4 без самой формы.
    expect(ring).toHaveLength(8 * 4 - 12);
  });

  it('россыпь: плотность от пустоты до каждой ячейки, в рамке — и между символами', () => {
    expect(run(gen('scatter', {}, { density: 0 }))).toEqual([]);
    expect(run(gen('scatter', {}, { density: 1 }))).toHaveLength(12);
    const sparse = [poseRows()[0], poseRows()[11]];
    expect(run(gen('scatter', { area: 'bounds' }, { density: 1 }), 0, sparse)).toHaveLength(12);
    const tick = gen('scatter', {}, { density: 0.5, period: 100 });
    expect(run(tick, 0)).toEqual(run(tick, 99));
    expect(run(tick, 0)).not.toEqual(run(tick, 100));
  });

  it('на кривую: по кругу вокруг центра в порядке чтения, символы вдоль кривой', () => {
    const out = run(gen('curve', {}, { radius: 5, spacing: 1, angle: 0 }));
    for (const p of out) {
      expect(Math.hypot(p.x - ROWS_CENTER.x, p.y - ROWS_CENTER.y)).toBeCloseTo(5, 9);
    }
    const a = out.find((p) => p.glyph === 'A')!;
    expect(a).toMatchObject({ x: ROWS_CENTER.x + 5, y: ROWS_CENTER.y });
    expect(a.rot).toBeCloseTo(90, 9);
    // «a» — первый символ второй строки: седьмой по порядку чтения.
    const second = out.find((p) => p.glyph === 'a')!;
    expect(Math.atan2(second.y - ROWS_CENTER.y, second.x - ROWS_CENTER.x)).toBeCloseTo(6 / 5, 9);
    const upright = run(gen('curve', { orient: 'upright' }));
    expect(upright.every((p) => p.rot === 0)).toBe(true);
  });
});

describe('сборки эффектов', () => {
  it('каждая сборка встаёт в поток целым графом и считается', () => {
    for (const preset of PRESETS.filter((p) => p.group === 'Эффекты')) {
      const g = insertFragment(chainGraph([]), presetFragment(preset.kind, 'x'));
      expect(graphProblem(g), preset.kind).toBeNull();
      expect(() => run(g, 700)).not.toThrow();
    }
  });
});

describe('словарь узлов', () => {
  it('у каждого узла свой вид, своя подпись и подсказка; сборки — только из словаря', () => {
    const kinds = NODES.map((n) => n.spec.kind);
    const labels = NODES.map((n) => n.spec.label);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(NODES.every((n) => n.spec.hint.length > 0)).toBe(true);
    for (const preset of PRESETS) {
      const fragment = presetFragment(preset.kind, 'x');
      expect(
        fragment.nodes.every((n) => kinds.includes(n.kind)),
        preset.kind,
      ).toBe(true);
    }
  });
});

describe('зерно сборки', () => {
  it('у каждой сборки огня своё зерно, у одной и той же основы — то же', () => {
    const seed = (base: string) =>
      presetFragment('fire', base).nodes.find((n) => n.kind === 'fire')!.options.seed;
    expect(seed('node-1')).not.toBe(seed('node-2'));
    expect(seed('node-1')).toBe(seed('node-1'));
  });
});
