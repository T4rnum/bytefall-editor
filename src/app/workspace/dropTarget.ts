import type { DropTarget, ZoneId } from './layout';

/**
 * Куда упадёт перетаскиваемая панель — по месту указателя над группами и зонами. Раскладка
 * DOM меряется снаружи, здесь только геометрия, поэтому правило проверяется тестом.
 */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface GroupBox {
  readonly zone: ZoneId;
  readonly index: number;
  readonly rect: Box;
  /** Высота заголовка с вкладками: над ним панель встаёт вкладкой. */
  readonly header: number;
}

export interface ZoneBox {
  readonly zone: ZoneId;
  readonly rect: Box;
  readonly groups: number;
}

/** Доля группы у края, над которой панель встаёт рядом, а не вкладкой. */
const EDGE = 0.3;

const inside = (r: Box, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** В колонках группы идут сверху вниз, в нижней полосе — слева направо. */
const across = (zone: ZoneId): boolean => zone === 'bottom';

export function dropTargetAt(
  x: number,
  y: number,
  groups: readonly GroupBox[],
  zones: readonly ZoneBox[],
): DropTarget | null {
  for (const g of groups) {
    if (!inside(g.rect, x, y)) continue;
    if (y < g.rect.y + g.header) return { zone: g.zone, kind: 'tab', group: g.index };
    const t = across(g.zone)
      ? (x - g.rect.x) / g.rect.w
      : (y - g.rect.y - g.header) / Math.max(1, g.rect.h - g.header);
    if (t < EDGE) return { zone: g.zone, kind: 'split', index: g.index };
    if (t > 1 - EDGE) return { zone: g.zone, kind: 'split', index: g.index + 1 };
    return { zone: g.zone, kind: 'tab', group: g.index };
  }
  // Пустое место зоны или полоса пустой зоны: новой группой в конец.
  const zone = zones.find((z) => inside(z.rect, x, y));
  return zone ? { zone: zone.zone, kind: 'split', index: zone.groups } : null;
}

/** Где подсветить место вставки: вся группа, её половина у края или вся зона. */
export function dropHighlight(
  target: DropTarget,
  groups: readonly GroupBox[],
  zones: readonly ZoneBox[],
): Box | null {
  const inZone = groups.filter((g) => g.zone === target.zone);
  if (target.kind === 'tab') return inZone.find((g) => g.index === target.group)?.rect ?? null;
  const after = inZone.find((g) => g.index === target.index - 1);
  const before = inZone.find((g) => g.index === target.index);
  const side = before ?? after;
  if (!side) return zones.find((z) => z.zone === target.zone)?.rect ?? null;
  const r = side.rect;
  if (across(target.zone)) {
    const w = r.w / 2;
    return before ? { ...r, w } : { ...r, x: r.x + w, w };
  }
  const h = r.h / 2;
  return before ? { ...r, h } : { ...r, y: r.y + h, h };
}
