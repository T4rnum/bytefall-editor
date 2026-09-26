import { describe, expect, it } from 'vitest';
import { NODES } from '../../../core/graph/nodes';
import { nodeMenuItems } from '../nodeMenu';

describe('меню «Добавить»', () => {
  it('в меню каждый узел словаря, кроме входа и вывода, и все сборки', () => {
    const items = nodeMenuItems();
    const nodes = items.flatMap((i) => ('node' in i.pick ? [i.pick.node] : []));
    const kinds = NODES.map((n) => n.spec.kind).filter((k) => k !== 'input' && k !== 'output');
    expect([...nodes].sort()).toEqual([...kinds].sort());
    expect(items.some((i) => 'preset' in i.pick && i.pick.preset === 'wave')).toBe(true);
    // Группы идут подряд: поля, действия, рождение, материал, служебные, сборки.
    const groups = items.map((i) => i.group).filter((g, i, all) => all.indexOf(g) === i);
    expect(groups).toEqual(['Поля', 'Действия', 'Рождение', 'Материал', 'Служебные', 'Сборки']);
  });

  it('поиск — по подписи и подсказке, без учёта регистра', () => {
    const glow = nodeMenuItems('СВЕЧ');
    expect(glow.map((i) => `${i.group}:${i.label}`)).toEqual([
      'Материал:Свечение',
      'Сборки:Свечение',
    ]);
    expect(nodeMenuItems('  ').length).toBe(nodeMenuItems().length);
    expect(nodeMenuItems('нет такого узла')).toEqual([]);
  });
});
