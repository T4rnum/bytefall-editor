import { type Layout, type PanelGroup, groupOf } from './layout';

/**
 * Готовые рабочие места под задачу (DESIGN.md, раздел 9). У рисования, анимации и 3D разные
 * нужные панели: раскладка под одну задачу мешает другой. Каждое место помнит свою раскладку,
 * «Сбросить раскладку» возвращает к набору отсюда.
 */
export type WorkspaceId = 'draw' | 'animate' | 'scene3d';

export interface WorkspaceInfo {
  readonly id: WorkspaceId;
  readonly label: string;
  readonly hotkey: string;
  readonly title: string;
}

export const WORKSPACES: readonly WorkspaceInfo[] = [
  {
    id: 'draw',
    label: 'Рисование',
    hotkey: '1',
    title: 'Кисти, цвета и символы слева, слои и объекты справа',
  },
  {
    id: 'animate',
    label: 'Анимация',
    hotkey: '2',
    title: 'Таймлайн во всю ширину, объекты и эффекты справа',
  },
  { id: 'scene3d', label: '3D', hotkey: '3', title: '3D-сцена справа, кисти убраны во вкладки' },
];

const collapsed = (group: PanelGroup): PanelGroup => ({ ...group, collapsed: true });

export const PRESETS: Readonly<Record<WorkspaceId, Layout>> = {
  draw: {
    zones: {
      left: { groups: [groupOf('brush'), groupOf('colors'), groupOf('glyph')], size: 260 },
      right: {
        groups: [
          groupOf('layers'),
          groupOf('objects', 'cell-attrs'),
          groupOf('effects', 'look', 'scene3d'),
        ],
        size: 300,
      },
      bottom: { groups: [groupOf('timeline', 'curves', 'nodes')], size: 180 },
    },
    hidden: [],
  },
  animate: {
    zones: {
      left: { groups: [groupOf('glyph', 'colors', 'brush')], size: 240 },
      right: {
        groups: [groupOf('layers'), groupOf('objects'), groupOf('effects', 'look', 'cell-attrs')],
        size: 320,
      },
      bottom: { groups: [groupOf('timeline', 'curves', 'nodes')], size: 280 },
    },
    hidden: ['scene3d'],
  },
  scene3d: {
    zones: {
      left: { groups: [collapsed(groupOf('brush', 'colors', 'glyph'))], size: 240 },
      right: {
        groups: [
          groupOf('layers'),
          groupOf('scene3d'),
          groupOf('objects', 'effects', 'look', 'cell-attrs'),
        ],
        size: 340,
      },
      bottom: { groups: [groupOf('timeline', 'curves', 'nodes')], size: 200 },
    },
    hidden: [],
  },
};

export const isWorkspaceId = (id: unknown): id is WorkspaceId =>
  WORKSPACES.some((w) => w.id === id);
