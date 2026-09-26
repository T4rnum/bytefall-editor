import { describe, expect, it } from 'vitest';
import { emptyGraph } from '../graph/build';
import { setNodeOption, setNodeValue } from '../graph/edit';
import { evaluateGraph, isAnimatedGraph } from '../graph/evaluate';
import { INPUT_NODE, OUTPUT_NODE } from '../graph/types';
import { wired as graph } from './helpers/graphs';
import { ROWS_CENTER, poseRows } from './helpers/poseScene';

const ctx = (time = 0) => ({ time, center: ROWS_CENTER, cells: new Map() });

describe('узлы графа', () => {
  it('частицы своей веткой не получают свечение объекта', () => {
    const g = graph(
      [
        ['p', 'particles'],
        ['glow', 'glow'],
        ['join', 'join'],
      ],
      [
        'in.glyphs → p.glyphs',
        'in.glyphs → glow.glyphs',
        'p.glyphs → join.a',
        'glow.glyphs → join.b',
        'join.glyphs → out.glyphs',
      ],
    );
    const out = evaluateGraph(g, poseRows(), ctx(800));
    const sparks = out.filter((p) => p.particle !== null);
    const own = out.filter((p) => p.particle === null);
    expect(sparks.length).toBeGreaterThan(0);
    expect(sparks.every((p) => !p.material)).toBe(true);
    expect(own.every((p) => p.material?.glow)).toBe(true);
    // Частицы снизу, объект поверх.
    expect(out[0].particle).not.toBeNull();
  });

  it('одно число на два входа; математика и диапазон', () => {
    let g = graph(
      [
        ['k', 'value'],
        ['mul', 'math'],
        ['dist', 'distance'],
        ['range', 'mapRange'],
        ['off', 'offset'],
      ],
      [
        'in.glyphs → off.glyphs',
        'off.glyphs → out.glyphs',
        'k.value → mul.a',
        'k.value → mul.b',
        'mul.value → off.x',
        'dist.value → range.value',
        'range.value → off.y',
      ],
    );
    g = setNodeValue(g, 'k', 'value', 3);
    g = setNodeValue(g, 'range', 'fromMax', 2);
    g = setNodeValue(g, 'range', 'toMax', 10);
    const [first] = evaluateGraph(g, poseRows(), ctx());
    expect(first.x).toBeCloseTo(0.5 + 9, 9);
    // Расстояние от центра больше 2 — диапазон обрезан на 10.
    expect(first.y).toBeCloseTo(0.5 + 10, 9);
    g = setNodeOption(g, 'range', 'clamp', 'extend');
    const [far] = evaluateGraph(g, poseRows(), ctx());
    expect(far.y).toBeGreaterThan(0.5 + 10);
    g = setNodeOption(g, 'mul', 'op', 'divide');
    expect(evaluateGraph(g, poseRows(), ctx())[0].x).toBeCloseTo(1.5, 9);
  });

  it('время двигает, статичный шум стоит; положение от центра', () => {
    const g = graph(
      [
        ['t', 'time'],
        ['off', 'offset'],
      ],
      ['in.glyphs → off.glyphs', 'off.glyphs → out.glyphs', 't.seconds → off.x'],
    );
    expect(isAnimatedGraph(g)).toBe(true);
    expect(evaluateGraph(g, poseRows(), ctx(2500))[0].x).toBeCloseTo(3, 9);
    const n = graph(
      [
        ['n', 'noise'],
        ['pos', 'position'],
        ['off', 'offset'],
      ],
      ['in.glyphs → off.glyphs', 'off.glyphs → out.glyphs', 'n.x → off.x', 'pos.y → off.y'],
    );
    const still = setNodeValue(setNodeOption(n, 'pos', 'origin', 'center'), 'n', 'period', 0);
    expect(isAnimatedGraph(still)).toBe(false);
    const a = evaluateGraph(still, poseRows(), ctx(0));
    const b = evaluateGraph(still, poseRows(), ctx(5000));
    expect(a.map((p) => p.x)).toEqual(b.map((p) => p.x));
    // Нижняя строка на 0.5 ниже центра (1), верхняя — на 0.5 выше: сдвиг по Y — их отступ.
    expect(a[0].y).toBeCloseTo(0.5 - 0.5, 9);
    expect(a[6].y).toBeCloseTo(1.5 + 0.5, 9);
  });

  it('без вывода или с оборванной связью — символы объекта как есть', () => {
    const g = { ...emptyGraph(), links: [] };
    expect(evaluateGraph(g, poseRows(), ctx())).toEqual([]);
    const noOut = { nodes: g.nodes.filter((n) => n.id !== OUTPUT_NODE), links: [] };
    expect(evaluateGraph(noOut, poseRows(), ctx())).toHaveLength(12);
    expect(g.nodes.map((n) => n.id)).toEqual([INPUT_NODE, OUTPUT_NODE]);
  });
});
