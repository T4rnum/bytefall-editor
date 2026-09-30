import { describe, expect, it } from 'vitest';
import { MENU_GAP, VIEW_MARGIN, clampInto, placeMenu } from '../popover';

const view = { width: 1000, height: 600 };
const menu = { width: 240, height: 90 };
const button = (x: number, y: number) => ({ x, y, width: 24, height: 24 });

describe('placeMenu', () => {
  it('встаёт под кнопкой по нужному краю', () => {
    expect(placeMenu(button(100, 50), menu, view, 'left')).toEqual({
      left: 100,
      top: 50 + 24 + MENU_GAP,
    });
    expect(placeMenu(button(500, 50), menu, view, 'right')).toEqual({
      left: 500 + 24 - 240,
      top: 50 + 24 + MENU_GAP,
    });
  });

  it('у левого края окна сдвигается внутрь, а не уходит за экран', () => {
    // Кнопка «⋯» у самого левого края, список выровнен по её правому краю.
    const place = placeMenu(button(10, 50), menu, view, 'right');
    expect(place.left).toBe(VIEW_MARGIN);
  });

  it('у правого края окна сдвигается влево', () => {
    const place = placeMenu(button(960, 50), menu, view, 'left');
    expect(place.left).toBe(view.width - menu.width - VIEW_MARGIN);
  });

  it('у нижнего края окна встаёт над кнопкой', () => {
    const place = placeMenu(button(100, 560), menu, view, 'left');
    expect(place.top).toBe(560 - MENU_GAP - menu.height);
  });

  it('список выше окна прижимается к верхнему краю', () => {
    const place = placeMenu(button(100, 300), { width: 240, height: 900 }, view, 'left');
    expect(place.top).toBe(VIEW_MARGIN);
  });
});

describe('clampInto', () => {
  const box = { width: 400, height: 300 };
  const add = { width: 220, height: 200 };

  it('меню, открытое у края поля, целиком остаётся в поле', () => {
    expect(clampInto({ left: 390, top: 290 }, add, box)).toEqual({
      left: box.width - add.width - MENU_GAP,
      top: box.height - add.height - MENU_GAP,
    });
  });

  it('меню, которое помещается, не двигается', () => {
    expect(clampInto({ left: 20, top: 30 }, add, box)).toEqual({ left: 20, top: 30 });
  });
});
