import {
  type DropTarget,
  type Layout,
  type PanelId,
  activatePanel,
  findPanel,
  movePanel,
  showPanel,
} from './layout';

/**
 * Куда встаёт панель, которую показывают, и куда возвращается панель из отдельного окна.
 * Чистые функции поверх раскладки: стор только зовёт их.
 */

/**
 * Место панели по набору: вкладкой к соседям по её группе в наборе, если кто-то из них сейчас
 * на виду, иначе отдельной группой на месте группы набора. Панели нет в наборе — в конец
 * правой колонки.
 */
export function homePlace(preset: Layout, layout: Layout, id: PanelId): DropTarget {
  const place = findPanel(preset, id);
  if (!place) return { zone: 'right', kind: 'split', index: Number.MAX_SAFE_INTEGER };
  const mates = preset.zones[place.zone].groups[place.group].panels.filter((p) => p !== id);
  for (const mate of mates) {
    const now = findPanel(layout, mate);
    if (now) return { zone: now.zone, kind: 'tab', group: now.group };
  }
  return { zone: place.zone, kind: 'split', index: place.group };
}

/** Где панель стоит сейчас — вкладкой среди соседей или одна, — чтобы потом вернуть её туда. */
export function currentPlace(layout: Layout, id: PanelId): DropTarget | null {
  const place = findPanel(layout, id);
  if (!place) return null;
  const alone = layout.zones[place.zone].groups[place.group].panels.length === 1;
  return alone
    ? { zone: place.zone, kind: 'split', index: place.group }
    : { zone: place.zone, kind: 'tab', group: place.group };
}

/** Видна ли панель: стоит активной вкладкой в развёрнутой группе. */
function onScreen(layout: Layout, id: PanelId): boolean {
  const place = findPanel(layout, id);
  if (!place) return false;
  const group = layout.zones[place.zone].groups[place.group];
  return group.active === id && !group.collapsed;
}

/**
 * Узлы или таймлайн (N): видны узлы — показать таймлайн, иначе узлы. Недостающая из двух
 * встаёт вкладкой к другой, как нижняя область Blender меняет вид; нет обеих — по набору.
 */
export function toggleNodes(layout: Layout, preset: Layout): Layout {
  const [show, other]: PanelId[] = onScreen(layout, 'nodes')
    ? ['timeline', 'nodes']
    : ['nodes', 'timeline'];
  if (findPanel(layout, show)) return activatePanel(layout, show);
  const beside = findPanel(layout, other);
  return beside
    ? movePanel(layout, show, { zone: beside.zone, kind: 'tab', group: beside.group })
    : showPanel(layout, show, homePlace(preset, layout, show));
}
