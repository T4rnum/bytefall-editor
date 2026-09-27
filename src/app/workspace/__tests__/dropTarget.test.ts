import { describe, expect, it } from 'vitest';
import { type GroupBox, type ZoneBox, dropHighlight, dropTargetAt } from '../dropTarget';

/** Правая колонка x 1000..1300: две группы по 200 пикселей, заголовок 24; нижняя полоса. */
const groups: GroupBox[] = [
  { zone: 'right', index: 0, rect: { x: 1000, y: 0, w: 300, h: 200 }, header: 24 },
  { zone: 'right', index: 1, rect: { x: 1000, y: 200, w: 300, h: 200 }, header: 24 },
  { zone: 'bottom', index: 0, rect: { x: 0, y: 700, w: 600, h: 200 }, header: 24 },
];
const zones: ZoneBox[] = [
  { zone: 'right', rect: { x: 1000, y: 0, w: 300, h: 700 }, groups: 2 },
  { zone: 'left', rect: { x: 0, y: 0, w: 40, h: 700 }, groups: 0 },
  { zone: 'bottom', rect: { x: 0, y: 700, w: 1300, h: 200 }, groups: 1 },
];

describe('место вставки перетаскиваемой панели', () => {
  it('над заголовком и серединой — вкладкой, у верхнего и нижнего края — рядом', () => {
    expect(dropTargetAt(1100, 10, groups, zones)).toEqual({ zone: 'right', kind: 'tab', group: 0 });
    expect(dropTargetAt(1100, 110, groups, zones)).toEqual({
      zone: 'right',
      kind: 'tab',
      group: 0,
    });
    expect(dropTargetAt(1100, 40, groups, zones)).toEqual({
      zone: 'right',
      kind: 'split',
      index: 0,
    });
    expect(dropTargetAt(1100, 390, groups, zones)).toEqual({
      zone: 'right',
      kind: 'split',
      index: 2,
    });
  });

  it('в нижней полосе край — левый и правый; пустая зона и пустое место — в конец', () => {
    expect(dropTargetAt(20, 800, groups, zones)).toEqual({
      zone: 'bottom',
      kind: 'split',
      index: 0,
    });
    expect(dropTargetAt(590, 800, groups, zones)).toEqual({
      zone: 'bottom',
      kind: 'split',
      index: 1,
    });
    expect(dropTargetAt(900, 800, groups, zones)).toEqual({
      zone: 'bottom',
      kind: 'split',
      index: 1,
    });
    expect(dropTargetAt(20, 300, groups, zones)).toEqual({ zone: 'left', kind: 'split', index: 0 });
    expect(dropTargetAt(1100, 600, groups, zones)).toEqual({
      zone: 'right',
      kind: 'split',
      index: 2,
    });
    expect(dropTargetAt(500, 300, groups, zones)).toBeNull();
  });

  it('подсветка: вкладкой — вся группа, рядом — половина у края, в пустую зону — зона', () => {
    expect(dropHighlight({ zone: 'right', kind: 'tab', group: 1 }, groups, zones)).toEqual(
      groups[1].rect,
    );
    expect(dropHighlight({ zone: 'right', kind: 'split', index: 1 }, groups, zones)).toEqual({
      x: 1000,
      y: 200,
      w: 300,
      h: 100,
    });
    expect(dropHighlight({ zone: 'right', kind: 'split', index: 2 }, groups, zones)).toEqual({
      x: 1000,
      y: 300,
      w: 300,
      h: 100,
    });
    expect(dropHighlight({ zone: 'bottom', kind: 'split', index: 0 }, groups, zones)).toEqual({
      x: 0,
      y: 700,
      w: 300,
      h: 200,
    });
    expect(dropHighlight({ zone: 'left', kind: 'split', index: 0 }, groups, zones)).toEqual(
      zones[1].rect,
    );
  });
});
