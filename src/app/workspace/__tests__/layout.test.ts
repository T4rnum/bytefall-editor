import { describe, expect, it } from 'vitest';
import {
  type Layout,
  PANEL_IDS,
  type PanelId,
  ZONE_IDS,
  activatePanel,
  findPanel,
  groupOf,
  hidePanel,
  movePanel,
  resizeZone,
  restoreLayout,
  showPanel,
  toggleCollapsed,
} from '../layout';
import { PRESETS, WORKSPACES } from '../presets';

const base: Layout = {
  zones: {
    left: { groups: [groupOf('brush'), groupOf('colors', 'glyph')], size: 260 },
    right: { groups: [groupOf('layers'), groupOf('objects')], size: 300 },
    bottom: { groups: [groupOf('timeline', 'nodes')], size: 200 },
  },
  hidden: ['effects'],
};

const ids = (layout: Layout, zone: 'left' | 'right' | 'bottom') =>
  layout.zones[zone].groups.map((g) => g.panels.join('+'));

/** Каждая панель стоит ровно в одном месте: в зоне или среди скрытых. */
function placedOnce(layout: Layout): boolean {
  const all = [
    ...ZONE_IDS.flatMap((z) => layout.zones[z].groups.flatMap((g) => g.panels)),
    ...layout.hidden,
  ];
  return new Set(all).size === all.length;
}

describe('раскладка рабочего места', () => {
  it('вкладкой в чужую группу: панель уходит из старой, становится активной в новой', () => {
    const next = movePanel(base, 'brush', { zone: 'right', kind: 'tab', group: 1 });
    expect(ids(next, 'left')).toEqual(['colors+glyph']);
    expect(ids(next, 'right')).toEqual(['layers', 'objects+brush']);
    expect(next.zones.right.groups[1].active).toBe('brush');
    expect(placedOnce(next)).toBe(true);
    expect(findPanel(next, 'brush')).toEqual({ zone: 'right', group: 1, tab: 1 });
  });

  it('отдельной группой: номер места — как до переноса, даже если своя группа исчезла', () => {
    // Кисть — одна в группе 0; ставим её после группы «цвета+символ», то есть на место 2.
    const next = movePanel(base, 'brush', { zone: 'left', kind: 'split', index: 2 });
    expect(ids(next, 'left')).toEqual(['colors+glyph', 'brush']);
    const top = movePanel(base, 'objects', { zone: 'right', kind: 'split', index: 0 });
    expect(ids(top, 'right')).toEqual(['objects', 'layers']);
    // Вкладка из группы с соседями: группа остаётся, активной — соседняя вкладка.
    const out = movePanel(base, 'nodes', { zone: 'left', kind: 'split', index: 0 });
    expect(ids(out, 'bottom')).toEqual(['timeline']);
    expect(out.zones.bottom.groups[0].active).toBe('timeline');
    expect(ids(out, 'left')).toEqual(['nodes', 'brush', 'colors+glyph']);
  });

  it('скрыть, показать, перетащить скрытую; вкладку на свою же группу — только активировать', () => {
    const hidden = hidePanel(base, 'layers');
    expect(ids(hidden, 'right')).toEqual(['objects']);
    expect(hidden.hidden).toEqual(['effects', 'layers']);
    const back = showPanel(hidden, 'layers', { zone: 'right', kind: 'split', index: 0 });
    expect(ids(back, 'right')).toEqual(['layers', 'objects']);
    expect(back.hidden).toEqual(['effects']);
    const dragged = movePanel(base, 'effects', { zone: 'bottom', kind: 'tab', group: 0 });
    expect(ids(dragged, 'bottom')).toEqual(['timeline+nodes+effects']);
    expect(dragged.hidden).toEqual([]);
    const same = movePanel(base, 'glyph', { zone: 'left', kind: 'tab', group: 1 });
    expect(same.zones.left.groups[1].active).toBe('glyph');
    expect(ids(same, 'left')).toEqual(ids(base, 'left'));
  });

  it('свёрнутая группа разворачивается, когда её панель просят показать; размеры в пределах', () => {
    const folded = toggleCollapsed(base, 'left', 1);
    expect(folded.zones.left.groups[1].collapsed).toBe(true);
    const shown = activatePanel(folded, 'glyph');
    expect(shown.zones.left.groups[1]).toMatchObject({ active: 'glyph', collapsed: false });
    expect(resizeZone(base, 'left', 10).zones.left.size).toBe(200);
    expect(resizeZone(base, 'bottom', 5000).zones.bottom.size).toBe(640);
    expect(resizeZone(base, 'right', 300)).toBe(base);
  });

  it('из хранилища: мусор чинится, неизвестная раскладка — набор по умолчанию', () => {
    const saved = {
      zones: {
        left: {
          groups: [
            { panels: ['brush', 'brush', 'ghost'], active: 'ghost' },
            { panels: [], active: 'x' },
          ],
          size: 99999,
        },
        right: {
          groups: [{ panels: ['layers', 'brush'], active: 'layers', collapsed: true }],
          size: 300,
        },
      },
      hidden: ['objects', 'layers'],
    };
    const layout = restoreLayout(saved, PRESETS.draw);
    // Повторы и чужие id выброшены; цвета и символ раскладка не знала — встали по набору.
    expect(ids(layout, 'left')).toEqual(['brush', 'colors', 'glyph']);
    expect(layout.zones.left.groups[0].active).toBe('brush');
    expect(layout.zones.left.size).toBe(520);
    expect(ids(layout, 'right')[0]).toBe('layers');
    expect(layout.zones.right.groups[0].collapsed).toBe(true);
    expect(layout.hidden).toContain('objects');
    // Панели, которых раскладка не знала, встают по набору: таймлайн — вниз.
    expect(findPanel(layout, 'timeline')?.zone).toBe('bottom');
    expect(placedOnce(layout)).toBe(true);
    expect(restoreLayout({ zones: 'nope' }, PRESETS.draw)).toBe(PRESETS.draw);
    expect(restoreLayout(null, PRESETS.draw)).toBe(PRESETS.draw);
  });

  it('готовые наборы: каждая панель на месте ровно один раз, у места есть клавиша', () => {
    for (const { id, hotkey } of WORKSPACES) {
      const layout = PRESETS[id];
      expect(placedOnce(layout)).toBe(true);
      const all = new Set<PanelId>([
        ...ZONE_IDS.flatMap((z) => layout.zones[z].groups.flatMap((g) => g.panels)),
        ...layout.hidden,
      ]);
      expect([...all].sort()).toEqual([...PANEL_IDS].sort());
      expect(hotkey).toMatch(/^[1-9]$/);
      expect(restoreLayout(JSON.parse(JSON.stringify(layout)), PRESETS.draw)).toEqual(layout);
    }
  });
});
