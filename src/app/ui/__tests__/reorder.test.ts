import { describe, expect, it } from 'vitest';
import { dropsBefore, reorderIndex } from '../reorder';

/** Переставляет список так, как это сделает приложение, чтобы проверять результат глазами. */
function move(list: string[], from: number, over: number, before: boolean): string[] {
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(reorderIndex(from, over, before), 0, item);
  return out;
}

describe('перестановка перетаскиванием', () => {
  const list = ['a', 'b', 'c', 'd'];

  it('вниз: перед строкой и после неё', () => {
    expect(move(list, 0, 2, true)).toEqual(['b', 'a', 'c', 'd']);
    expect(move(list, 0, 2, false)).toEqual(['b', 'c', 'a', 'd']);
    expect(move(list, 1, 3, false)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('вверх: перед строкой и после неё', () => {
    expect(move(list, 3, 1, true)).toEqual(['a', 'd', 'b', 'c']);
    expect(move(list, 3, 1, false)).toEqual(['a', 'b', 'd', 'c']);
    expect(move(list, 2, 0, true)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('на себя и на соседнюю сторону соседа — на месте', () => {
    expect(reorderIndex(2, 2, true)).toBe(2);
    expect(reorderIndex(2, 2, false)).toBe(2);
    expect(reorderIndex(1, 2, true)).toBe(1);
    expect(reorderIndex(2, 1, false)).toBe(2);
  });

  it('верхняя половина строки — перед ней', () => {
    expect(dropsBefore(104, { top: 100, height: 20 })).toBe(true);
    expect(dropsBefore(111, { top: 100, height: 20 })).toBe(false);
  });
});
