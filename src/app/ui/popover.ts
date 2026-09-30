/**
 * Где встаёт всплывающий список: под кнопкой или над ней и всегда целиком внутри окна. Колонки
 * рабочего места обрезают всё, что выходит за их край, поэтому список не живёт внутри них, а
 * ставится поверх, по координатам окна.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Place {
  readonly left: number;
  readonly top: number;
}

/** Зазор между кнопкой и списком. */
export const MENU_GAP = 4;
/** Отступ списка от края окна. */
export const VIEW_MARGIN = 8;

/** Значение в пределах; если пределы перевернулись — список больше места, — к нижнему. */
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));

/**
 * Список под кнопкой, выровненный по её левому или правому краю. Не влезает вниз — встаёт над
 * кнопкой, если там места больше. У бокового края окна он сдвигается внутрь.
 */
export function placeMenu(
  anchor: Rect,
  menu: Size,
  view: Size,
  align: 'left' | 'right',
  gap = MENU_GAP,
  margin = VIEW_MARGIN,
): Place {
  const below = anchor.y + anchor.height + gap;
  const spaceBelow = view.height - margin - below;
  const spaceAbove = anchor.y - gap - margin;
  const top =
    menu.height <= spaceBelow || spaceBelow >= spaceAbove ? below : anchor.y - gap - menu.height;
  const left = align === 'right' ? anchor.x + anchor.width - menu.width : anchor.x;
  return {
    left: clamp(left, margin, view.width - menu.width - margin),
    top: clamp(top, margin, view.height - menu.height - margin),
  };
}

/** Меню, открытое в точке поля, сдвигается так, чтобы целиком остаться в этом поле. */
export function clampInto(at: Place, menu: Size, box: Size, margin = MENU_GAP): Place {
  return {
    left: clamp(at.left, margin, box.width - menu.width - margin),
    top: clamp(at.top, margin, box.height - menu.height - margin),
  };
}
