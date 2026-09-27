import { z } from 'zod';

/**
 * Раскладка рабочего места (DESIGN.md, раздел 9): где стоит каждая панель. Три зоны вокруг
 * холста — левая и правая колонки и нижняя полоса. В зоне — группы по порядку, в группе —
 * вкладки, видна одна. Панель стоит в раскладке не больше одного раза или скрыта. Все операции
 * — чистые функции: раскладку хранит стор, а проверяют тесты.
 */

/** Панели рабочего места. Порядок — порядок в меню «Панели». */
export const PANEL_IDS = [
  'layers',
  'objects',
  'scene3d',
  'cell-attrs',
  'effects',
  'look',
  'brush',
  'colors',
  'glyph',
  'timeline',
  'nodes',
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

export type ZoneId = 'left' | 'right' | 'bottom';

export const ZONE_IDS: readonly ZoneId[] = ['left', 'right', 'bottom'];

export interface PanelGroup {
  readonly panels: readonly PanelId[];
  readonly active: PanelId;
  /** Свёрнута до заголовка. */
  readonly collapsed: boolean;
}

export interface Zone {
  readonly groups: readonly PanelGroup[];
  /** Ширина колонки или высота нижней полосы, пикселей. */
  readonly size: number;
}

export interface Layout {
  readonly zones: Readonly<Record<ZoneId, Zone>>;
  /** Скрытые панели: их нет ни в одной зоне, меню «Панели» возвращает их на место. */
  readonly hidden: readonly PanelId[];
}

export const ZONE_LIMITS: Readonly<Record<ZoneId, { min: number; max: number }>> = {
  left: { min: 200, max: 520 },
  right: { min: 220, max: 560 },
  bottom: { min: 120, max: 640 },
};

/**
 * Куда встанет панель: вкладкой в группу `group` или отдельной группой на место `index`, перед
 * группой с этим номером; номер, равный числу групп, — в конец зоны.
 */
export type DropTarget =
  | { readonly zone: ZoneId; readonly kind: 'tab'; readonly group: number }
  | { readonly zone: ZoneId; readonly kind: 'split'; readonly index: number };

export interface PanelPlace {
  readonly zone: ZoneId;
  readonly group: number;
  readonly tab: number;
}

export const isPanelId = (id: string): id is PanelId =>
  (PANEL_IDS as readonly string[]).includes(id);

export const groupOf = (...panels: readonly PanelId[]): PanelGroup => ({
  panels,
  active: panels[0],
  collapsed: false,
});

export function findPanel(layout: Layout, id: PanelId): PanelPlace | null {
  for (const zone of ZONE_IDS) {
    const groups = layout.zones[zone].groups;
    for (let group = 0; group < groups.length; group++) {
      const tab = groups[group].panels.indexOf(id);
      if (tab >= 0) return { zone, group, tab };
    }
  }
  return null;
}

const withZone = (layout: Layout, zone: ZoneId, next: Zone): Layout => ({
  ...layout,
  zones: { ...layout.zones, [zone]: next },
});

const withGroups = (layout: Layout, zone: ZoneId, groups: readonly PanelGroup[]): Layout =>
  withZone(layout, zone, { ...layout.zones[zone], groups });

/** Убирает панель из зоны; опустевшая группа исчезает, активной становится соседняя вкладка. */
function detach(layout: Layout, id: PanelId): Layout {
  const place = findPanel(layout, id);
  if (!place) return layout;
  const groups = layout.zones[place.zone].groups.slice();
  const group = groups[place.group];
  const panels = group.panels.filter((p) => p !== id);
  if (panels.length === 0) groups.splice(place.group, 1);
  else {
    const active =
      group.active === id ? panels[Math.min(place.tab, panels.length - 1)] : group.active;
    groups[place.group] = { ...group, panels, active };
  }
  return withGroups(layout, place.zone, groups);
}

/** Ставит панель, которой в зонах нет, по месту вставки; она становится активной. */
function attach(layout: Layout, id: PanelId, target: DropTarget): Layout {
  const groups = layout.zones[target.zone].groups.slice();
  if (target.kind === 'tab' && groups[target.group]) {
    const group = groups[target.group];
    groups[target.group] = {
      ...group,
      panels: [...group.panels, id],
      active: id,
      collapsed: false,
    };
  } else {
    const index = target.kind === 'split' ? target.index : groups.length;
    groups.splice(Math.max(0, Math.min(groups.length, index)), 0, groupOf(id));
  }
  const next = withGroups(layout, target.zone, groups);
  return { ...next, hidden: next.hidden.filter((p) => p !== id) };
}

/**
 * Переносит панель, откуда бы она ни была — из зоны или из скрытых. Номера места вставки — как в
 * раскладке до переноса: если панель уносит с собой свою группу, номера за ней сдвигаются.
 */
export function movePanel(layout: Layout, id: PanelId, target: DropTarget): Layout {
  const from = findPanel(layout, id);
  if (!from) return attach(layout, id, target);
  const alone = layout.zones[from.zone].groups[from.group].panels.length === 1;
  if (target.kind === 'tab' && target.zone === from.zone && target.group === from.group) {
    return activatePanel(layout, id);
  }
  let place = target;
  if (alone && target.zone === from.zone) {
    if (target.kind === 'tab' && target.group > from.group) {
      place = { ...target, group: target.group - 1 };
    }
    if (target.kind === 'split' && target.index > from.group) {
      place = { ...target, index: target.index - 1 };
    }
  }
  return attach(detach(layout, id), id, place);
}

/** Скрывает панель: её место освобождается, меню «Панели» вернёт её. */
export function hidePanel(layout: Layout, id: PanelId): Layout {
  const next = detach(layout, id);
  return next.hidden.includes(id) ? next : { ...next, hidden: [...next.hidden, id] };
}

/** Делает панель видимой: активная вкладка своей группы, группа развёрнута. */
export function activatePanel(layout: Layout, id: PanelId): Layout {
  const place = findPanel(layout, id);
  if (!place) return layout;
  const groups = layout.zones[place.zone].groups.slice();
  groups[place.group] = { ...groups[place.group], active: id, collapsed: false };
  return withGroups(layout, place.zone, groups);
}

/** Показывает панель: стоящую — делает активной, скрытую — ставит по месту `fallback`. */
export function showPanel(layout: Layout, id: PanelId, fallback: DropTarget): Layout {
  return findPanel(layout, id) ? activatePanel(layout, id) : attach(layout, id, fallback);
}

export function toggleCollapsed(layout: Layout, zone: ZoneId, group: number): Layout {
  const groups = layout.zones[zone].groups.slice();
  if (!groups[group]) return layout;
  groups[group] = { ...groups[group], collapsed: !groups[group].collapsed };
  return withGroups(layout, zone, groups);
}

export const clampZone = (zone: ZoneId, size: number): number =>
  Math.round(Math.min(ZONE_LIMITS[zone].max, Math.max(ZONE_LIMITS[zone].min, size)));

export function resizeZone(layout: Layout, zone: ZoneId, size: number): Layout {
  const next = clampZone(zone, size);
  return next === layout.zones[zone].size
    ? layout
    : withZone(layout, zone, { ...layout.zones[zone], size: next });
}

const savedSchema = z.object({
  zones: z.record(
    z.string(),
    z.object({
      groups: z
        .array(
          z.object({
            panels: z.array(z.string()).max(64),
            active: z.string(),
            collapsed: z.boolean().optional(),
          }),
        )
        .max(64),
      size: z.number(),
    }),
  ),
  hidden: z.array(z.string()).max(64).optional(),
});

/**
 * Раскладка из хранилища. Всё сомнительное чинится: чужие и повторные панели выбрасываются,
 * пустые группы исчезают, размеры встают в пределы. Панель, которой раскладка не знает — её
 * добавила новая версия редактора, — встаёт туда, где она в `fallback`.
 */
export function restoreLayout(raw: unknown, fallback: Layout): Layout {
  const parsed = savedSchema.safeParse(raw);
  if (!parsed.success) return fallback;
  const seen = new Set<PanelId>();
  const take = (ids: readonly string[]): PanelId[] => {
    const out: PanelId[] = [];
    for (const id of ids) {
      if (!isPanelId(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  const zones = {} as Record<ZoneId, Zone>;
  for (const zone of ZONE_IDS) {
    const saved = parsed.data.zones[zone];
    const groups: PanelGroup[] = [];
    for (const g of saved?.groups ?? []) {
      const panels = take(g.panels);
      if (panels.length === 0) continue;
      const active = panels.find((p) => p === g.active) ?? panels[0];
      groups.push({ panels, active, collapsed: g.collapsed ?? false });
    }
    const size = saved ? clampZone(zone, saved.size) : fallback.zones[zone].size;
    zones[zone] = { groups, size };
  }
  let layout: Layout = { zones, hidden: take(parsed.data.hidden ?? []) };
  for (const id of PANEL_IDS) {
    if (seen.has(id)) continue;
    const place = findPanel(fallback, id);
    layout = place
      ? attach(layout, id, { zone: place.zone, kind: 'split', index: place.group })
      : { ...layout, hidden: [...layout.hidden, id] };
  }
  return layout;
}
