import { NODES } from '../../core/graph/nodes';
import { PRESETS, type PresetKind } from '../../core/graph/presetMenu';
import type { NodeCategory } from '../../core/graph/types';

/** Что добавляет пункт меню: один узел под указателем или готовую сборку перед выводом. */
export type NodePick = { readonly node: string } | { readonly preset: PresetKind };

export interface NodeMenuItem {
  readonly group: string;
  readonly label: string;
  readonly hint: string;
  readonly pick: NodePick;
}

const GROUPS: readonly { readonly category: NodeCategory; readonly label: string }[] = [
  { category: 'field', label: 'Поля' },
  { category: 'action', label: 'Действия' },
  { category: 'generator', label: 'Рождение' },
  { category: 'material', label: 'Материал' },
  { category: 'utility', label: 'Служебные' },
];

const ALL: readonly NodeMenuItem[] = [
  ...GROUPS.flatMap(({ category, label }) =>
    NODES.filter((n) => n.spec.category === category).map((n) => ({
      group: label,
      label: n.spec.label,
      hint: n.spec.hint,
      pick: { node: n.spec.kind },
    })),
  ),
  ...PRESETS.map((p) => ({
    group: 'Сборки',
    label: p.label,
    hint: `${p.group}: готовая цепочка узлов, встаёт в поток перед выводом`,
    pick: { preset: p.kind },
  })),
];

/**
 * Пункты меню «Добавить» по группам. Поиск — по подписи и подсказке без учёта регистра:
 * «свеч» находит и узел «Свечение», и сборку. Вход и вывод в меню не попадают: они у графа одни.
 */
export function nodeMenuItems(query = ''): readonly NodeMenuItem[] {
  const q = query.trim().toLowerCase();
  if (q === '') return ALL;
  return ALL.filter(
    (item) => item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q),
  );
}
