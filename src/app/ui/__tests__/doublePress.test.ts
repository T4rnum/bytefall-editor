import { describe, expect, it } from 'vitest';
import { doublePress } from '../doublePress';

describe('двойной щелчок по своему элементу', () => {
  it('оба нажатия здесь — переименование', () => {
    let calls = 0;
    const press = doublePress(() => calls++);
    press.onMouseDown({ detail: 1, timeStamp: 100 });
    press.onMouseDown({ detail: 2, timeStamp: 300 });
    press.onDoubleClick({ detail: 2, timeStamp: 310 });
    expect(calls).toBe(1);
  });

  it('первое нажатие было по строке, которую удалили, — не переименование', () => {
    let calls = 0;
    const next = doublePress(() => calls++);
    // Первого нажатия эта строка не видела: браузер сразу присылает второе.
    next.onMouseDown({ detail: 2, timeStamp: 300 });
    next.onDoubleClick({ detail: 2, timeStamp: 310 });
    expect(calls).toBe(0);
  });

  it('старое нажатие не склеивается с новой парой', () => {
    let calls = 0;
    const press = doublePress(() => calls++);
    press.onMouseDown({ detail: 1, timeStamp: 100 });
    press.onDoubleClick({ detail: 2, timeStamp: 5000 });
    expect(calls).toBe(0);
  });
});
