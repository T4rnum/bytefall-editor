import type { ReactNode } from 'react';
import type { PanelId } from '../../workspace/layout';
import { BrushPanel } from '../BrushPanel';
import { CellAttrsPanel } from '../CellAttrsPanel';
import { CurvesPanel } from '../curves/CurvesPanel';
import { ColorPanel } from '../ColorPanel';
import { EffectsPanel } from '../EffectsPanel';
import { GlyphPanel } from '../GlyphPanel';
import { LayersPanel } from '../LayersPanel';
import { LookPanel } from '../LookPanel';
import { ObjectsPanel } from '../ObjectsPanel';
import { NodePanel } from '../nodes/NodePanel';
import { Scene3DPanel } from '../scene3d/Scene3DPanel';
import { TimelinePanel } from '../timeline/TimelinePanel';

export interface PanelSpec {
  readonly title: string;
  /** Подсказка к вкладке: что в панели. */
  readonly hint: string;
  readonly render: () => ReactNode;
  /** Панель тянется на свободную высоту колонки. */
  readonly grow?: boolean;
}

/**
 * Панели рабочего места по идентификатору: раскладка знает только id, а что рисовать и как
 * назвать вкладку — здесь. Новая панель появляется в `PANEL_IDS`, здесь и в наборах.
 */
export const PANELS: Readonly<Record<PanelId, PanelSpec>> = {
  layers: { title: 'Слои', hint: 'Слои документа', render: () => <LayersPanel /> },
  objects: {
    title: 'Объекты',
    hint: 'Объекты слоя и свойства выбранного',
    render: () => <ObjectsPanel />,
  },
  scene3d: { title: '3D', hint: '3D-сцена активного слоя', render: () => <Scene3DPanel /> },
  'cell-attrs': {
    title: 'Свойства ячеек',
    hint: 'Метки для игры на выделенных ячейках',
    render: () => <CellAttrsPanel />,
  },
  effects: { title: 'Эффекты', hint: 'Эффекты слоя', render: () => <EffectsPanel /> },
  look: {
    title: 'Постобработка',
    hint: 'Свечение, развёртка, виньетка',
    render: () => <LookPanel />,
  },
  brush: { title: 'Кисти', hint: 'Кисти левой и правой кнопки', render: () => <BrushPanel /> },
  colors: { title: 'Цвета', hint: 'Палитра и цвета кисти', render: () => <ColorPanel /> },
  glyph: {
    title: 'Символы',
    hint: 'Символ кисти',
    render: () => <GlyphPanel />,
    grow: true,
  },
  timeline: {
    title: 'Таймлайн',
    hint: 'Кадры и ключи сцены',
    render: () => <TimelinePanel />,
    grow: true,
  },
  curves: {
    title: 'Кривые',
    hint: 'Значения ключей во времени и ручки переходов (G)',
    render: () => <CurvesPanel />,
    grow: true,
  },
  nodes: {
    title: 'Узлы',
    hint: 'Граф узлов выбранного объекта',
    render: () => <NodePanel />,
    grow: true,
  },
};
