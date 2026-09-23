import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type CellBuffer, createCellBuffer } from '../../core/cellBuffer';
import { slotCount, slotOf, tileLayout, tileOf } from '../../core/tiles';
import { GridMesh } from '../GridMesh';
import { FakeAtlas } from './helpers/fakeAtlas';

function meshOf(width: number, height: number) {
  const atlas = new FakeAtlas();
  const grid = new GridMesh(atlas);
  const buffer = createCellBuffer(width, height);
  return { atlas, grid, buffer };
}

const geometry = (grid: GridMesh): THREE.InstancedBufferGeometry =>
  grid.mesh.geometry as THREE.InstancedBufferGeometry;

const attr = (grid: GridMesh, name: string): THREE.InstancedBufferAttribute =>
  grid.mesh.geometry.getAttribute(name) as THREE.InstancedBufferAttribute;

/** Заполняет ячейку так, чтобы её было видно в атрибутах. */
function paint(buffer: CellBuffer, x: number, y: number, glyph: string, red: number): void {
  const i = y * buffer.width + x;
  buffer.glyphs[i] = glyph;
  buffer.fg[i * 4] = red;
  buffer.fg[i * 4 + 3] = 1;
}

describe('раскладка инстансов', () => {
  it('инстансов ровно столько, сколько ячеек', () => {
    const { grid, buffer } = meshOf(70, 40);
    grid.update(buffer);
    expect(geometry(grid).instanceCount).toBe(70 * 40);
    expect(geometry(grid).instanceCount).toBe(slotCount(tileLayout(70, 40)));
  });

  it('координаты ячеек разложены тайл за тайлом, а не построчно', () => {
    const { grid, buffer } = meshOf(64, 32);
    grid.update(buffer);
    const cells = attr(grid, 'aCell').array as Float32Array;
    const layout = tileLayout(64, 32);
    // Ячейка (33, 0) лежит во втором тайле, поэтому в построчном порядке её слот был бы 33.
    const slot = slotOf(layout, 33, 0);
    expect(slot).not.toBe(33);
    expect([cells[slot * 2], cells[slot * 2 + 1]]).toEqual([33, 0]);
  });

  it('каждой ячейке холста соответствует ровно один слот', () => {
    const { grid, buffer } = meshOf(70, 40);
    grid.update(buffer);
    const cells = attr(grid, 'aCell').array as Float32Array;
    const seen = new Set<string>();
    for (let slot = 0; slot < 70 * 40; slot++)
      seen.add(`${cells[slot * 2]},${cells[slot * 2 + 1]}`);
    expect(seen.size).toBe(70 * 40);
  });
});

describe('частичная заливка', () => {
  it('без списка тайлов заливается весь буфер', () => {
    const { grid, buffer } = meshOf(64, 32);
    grid.update(buffer);
    expect(attr(grid, 'aFg').updateRanges).toEqual([{ start: 0, count: 64 * 32 * 4 }]);
  });

  it('правка одной ячейки заливает один тайл, а не холст', () => {
    const { grid, buffer } = meshOf(64, 32);
    grid.update(buffer);
    const layout = tileLayout(64, 32);
    const tile = tileOf(layout, 40, 5);

    paint(buffer, 40, 5, '#', 0.5);
    grid.update(buffer, [tile]);

    const ranges = attr(grid, 'aFg').updateRanges;
    expect(ranges).toHaveLength(1);
    expect(ranges[0].count).toBe(32 * 32 * 4);
    // Весь холст это вчетверо больше: заливается ровно четверть.
    expect(ranges[0].count).toBeLessThan(64 * 32 * 4);
  });

  it('значение доезжает в слот изменённой ячейки', () => {
    const { grid, buffer } = meshOf(64, 32);
    grid.update(buffer);
    const layout = tileLayout(64, 32);

    paint(buffer, 40, 5, '#', 0.5);
    grid.update(buffer, [tileOf(layout, 40, 5)]);

    const slot = slotOf(layout, 40, 5);
    expect((attr(grid, 'aFg').array as Float32Array)[slot * 4]).toBeCloseTo(0.5);
  });

  it('ячейки вне указанных тайлов не трогаются', () => {
    const { grid, buffer } = meshOf(64, 32);
    paint(buffer, 1, 1, 'A', 0.25);
    grid.update(buffer);
    const layout = tileLayout(64, 32);
    const slot = slotOf(layout, 1, 1);
    const fg = attr(grid, 'aFg').array as Float32Array;
    expect(fg[slot * 4]).toBeCloseTo(0.25);

    // Меняем буфер в первом тайле, но заливаем только второй.
    paint(buffer, 1, 1, 'B', 0.75);
    grid.update(buffer, [tileOf(layout, 40, 0)]);
    expect(fg[slot * 4]).toBeCloseTo(0.25);
  });

  it('соседние тайлы склеиваются в один диапазон', () => {
    const { grid, buffer } = meshOf(64, 32);
    grid.update(buffer);
    grid.update(buffer, [0, 1]);
    expect(attr(grid, 'aFg').updateRanges).toEqual([{ start: 0, count: 64 * 32 * 4 }]);
  });

  it('пустой список тайлов не заливает ничего', () => {
    const { grid, buffer } = meshOf(64, 32);
    grid.update(buffer);
    const before = attr(grid, 'aFg').updateRanges.length;
    grid.update(buffer, []);
    expect(attr(grid, 'aFg').updateRanges).toHaveLength(before);
  });

  it('смена размера холста перезаливает всё, а список тайлов игнорируется', () => {
    const { grid } = meshOf(64, 32);
    const small = createCellBuffer(64, 32);
    grid.update(small);
    const bigger = createCellBuffer(96, 64);
    grid.update(bigger, [0]);
    expect(geometry(grid).instanceCount).toBe(96 * 64);
    expect(attr(grid, 'aFg').updateRanges).toEqual([{ start: 0, count: 96 * 64 * 4 }]);
  });
});

describe('атлас', () => {
  it('рост атласа требует полной перезаливки', () => {
    const { atlas, grid, buffer } = meshOf(64, 32);
    grid.update(buffer);
    expect(grid.needsRefresh()).toBe(false);
    atlas.version += 1;
    expect(grid.needsRefresh()).toBe(true);
  });
});
