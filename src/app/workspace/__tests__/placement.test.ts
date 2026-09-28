import { describe, expect, it } from 'vitest';
import { type Layout, findPanel, groupOf, hidePanel } from '../layout';
import { currentPlace, homePlace, toggleWithTimeline } from '../placement';
import { PRESETS } from '../presets';

const toggleNodes = (layout: Layout, preset: Layout): Layout =>
  toggleWithTimeline(layout, preset, 'nodes');

const layout: Layout = {
  zones: {
    left: { groups: [groupOf('glyph', 'colors'), groupOf('brush')], size: 260 },
    right: { groups: [groupOf('layers')], size: 300 },
    bottom: { groups: [groupOf('timeline', 'nodes')], size: 200 },
  },
  hidden: ['objects', 'cell-attrs', 'effects', 'look', 'scene3d'],
};

describe('куда встаёт панель', () => {
  it('скрытая встаёт вкладкой к соседям по набору, а без соседей — на место группы набора', () => {
    // В наборе «Рисование» объекты делят группу со свойствами ячеек — их нет, ставим отдельно.
    expect(homePlace(PRESETS.draw, layout, 'objects')).toEqual({
      zone: 'right',
      kind: 'split',
      index: 1,
    });
    // В «Анимации» кисти во вкладках с символами и цветами: символы на виду в группе 0 слева.
    expect(homePlace(PRESETS.animate, layout, 'brush')).toEqual({
      zone: 'left',
      kind: 'tab',
      group: 0,
    });
  });

  it('из отдельного окна — туда, где стояла: вкладкой к соседям или своей группой', () => {
    expect(currentPlace(layout, 'colors')).toEqual({ zone: 'left', kind: 'tab', group: 0 });
    expect(currentPlace(layout, 'brush')).toEqual({ zone: 'left', kind: 'split', index: 1 });
    expect(currentPlace(layout, 'objects')).toBeNull();
  });

  it('N: таймлайн — узлы — таймлайн; недостающая встаёт вкладкой к другой', () => {
    const nodes = toggleNodes(layout, PRESETS.draw);
    expect(nodes.zones.bottom.groups[0].active).toBe('nodes');
    expect(toggleNodes(nodes, PRESETS.draw).zones.bottom.groups[0].active).toBe('timeline');
    // Узлы скрыты — встают вкладкой к таймлайну.
    const noNodes = hidePanel(layout, 'nodes');
    const back = toggleNodes(noNodes, PRESETS.draw);
    expect(back.zones.bottom.groups[0]).toMatchObject({
      panels: ['timeline', 'nodes'],
      active: 'nodes',
    });
    // Обеих нет — узлы по набору: вниз, на место группы таймлайна.
    const none = hidePanel(noNodes, 'timeline');
    expect(findPanel(toggleNodes(none, PRESETS.draw), 'nodes')?.zone).toBe('bottom');
  });
});
