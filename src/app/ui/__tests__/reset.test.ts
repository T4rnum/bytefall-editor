import { describe, expect, it } from 'vitest';
import { resetTo } from '../reset';

describe('сброс параметра', () => {
  it('есть, только когда значение отличается от значения по умолчанию', () => {
    expect(resetTo(1, 1, () => undefined)).toBeUndefined();
    expect(resetTo('@*+.', '@*+.', () => undefined)).toBeUndefined();
    expect(resetTo(0.5, 1, () => undefined)).toBeTypeOf('function');
  });

  it('ставит значение по умолчанию', () => {
    const applied: number[] = [];
    resetTo(3, 8, (v) => applied.push(v))?.();
    expect(applied).toEqual([8]);
  });
});
