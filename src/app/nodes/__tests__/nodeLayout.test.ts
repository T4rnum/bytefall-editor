import { describe, expect, it } from 'vitest';
import { chainGraph } from '../../../core/graph/build';
import { createNode } from '../../../core/graph/edit';
import { nodeSpec } from '../../../core/graph/nodes';
import {
  HEADER_HEIGHT,
  NODE_PAD,
  NODE_WIDTH,
  ROW_HEIGHT,
  linkPath,
  nodeHeight,
  nodeRows,
  nodesBounds,
  nodesInBox,
  socketAt,
} from '../nodeLayout';
import { fitView, panBy, toGraph, toScreen, zoomAt } from '../nodeView';

describe('разметка узла', () => {
  it('сверху выходы, под ними входы, внизу настройки', () => {
    const rows = nodeRows(nodeSpec('rotate')!);
    expect(rows.map((r) => `${r.kind}:${r.name}`)).toEqual([
      'output:glyphs',
      'input:glyphs',
      'input:angle',
      'input:strength',
      'option:pivot',
    ]);
    expect(nodeHeight(nodeSpec('rotate')!)).toBe(HEADER_HEIGHT + 5 * ROW_HEIGHT + NODE_PAD);
  });

  it('гнездо входа на левом краю, выхода на правом, по середине своего ряда', () => {
    const node = createNode('offset', 100, 40, 'o');
    expect(socketAt(node, 'out', 'glyphs')).toEqual({
      x: 100 + NODE_WIDTH,
      y: 40 + HEADER_HEIGHT + ROW_HEIGHT / 2,
    });
    expect(socketAt(node, 'in', 'strength')).toEqual({
      x: 100,
      y: 40 + HEADER_HEIGHT + 4.5 * ROW_HEIGHT,
    });
    expect(socketAt(node, 'in', 'nope')).toBeNull();
    expect(socketAt(createNode('teleport', 0, 0), 'in', 'glyphs')).toBeNull();
  });

  it('связь выходит и входит горизонтально, назад выгибается петлёй', () => {
    expect(linkPath({ x: 0, y: 0 }, { x: 200, y: 50 })).toBe('M 0 0 C 100 0, 100 50, 200 50');
    expect(linkPath({ x: 100, y: 0 }, { x: 80, y: 0 })).toBe('M 100 0 C 148 0, 32 0, 80 0');
  });

  it('габарит — по всем узлам или по выбранным, рамка задевает узел краем', () => {
    const graph = chainGraph([]);
    const box = nodesBounds(graph)!;
    const out = graph.nodes.find((n) => n.id === 'out')!;
    expect(box.x).toBe(0);
    expect(box.width).toBe(out.x + NODE_WIDTH);
    expect(nodesBounds(graph, new Set(['in']))).toMatchObject({ x: 0, width: NODE_WIDTH });
    expect(nodesBounds(graph, new Set())).toBeNull();
    expect(nodesInBox(graph, { x: NODE_WIDTH - 1, y: 0, width: 2, height: 2 })).toEqual(['in']);
    expect(nodesInBox(graph, { x: NODE_WIDTH + 1, y: 0, width: 2, height: 2 })).toEqual([]);
  });
});

describe('взгляд на поле узлов', () => {
  it('экран и поле переводятся друг в друга, сдвиг ведёт поле за указателем', () => {
    const view = { x: 10, y: 20, zoom: 2 };
    expect(toGraph(view, 40, 60)).toEqual({ x: 30, y: 50 });
    expect(toScreen(view, { x: 30, y: 50 })).toEqual({ x: 40, y: 60 });
    expect(toScreen(panBy(view, 8, -4), { x: 30, y: 50 })).toEqual({ x: 48, y: 56 });
  });

  it('масштаб держит точку под указателем и не выходит за пределы', () => {
    const view = { x: 0, y: 0, zoom: 1 };
    const zoomed = zoomAt(view, 100, 50, 1.5);
    expect(zoomed.zoom).toBe(1.5);
    expect(toGraph(zoomed, 100, 50)).toEqual(toGraph(view, 100, 50));
    expect(zoomAt(view, 0, 0, 100).zoom).toBe(2);
    expect(zoomAt(view, 0, 0, 0.001).zoom).toBe(0.25);
  });

  it('вписанный граф по центру окна и не крупнее 1:1', () => {
    const small = fitView({ x: 0, y: 0, width: 100, height: 50 }, 800, 400);
    expect(small.zoom).toBe(1);
    expect(toScreen(small, { x: 50, y: 25 })).toEqual({ x: 400, y: 200 });
    const wide = fitView({ x: 0, y: 0, width: 1472, height: 100 }, 800, 400);
    expect(wide.zoom).toBeCloseTo(0.5, 9);
    expect(fitView(null, 800, 400).zoom).toBe(1);
  });
});
