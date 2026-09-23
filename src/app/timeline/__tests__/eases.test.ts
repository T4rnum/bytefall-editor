import { describe, expect, it } from 'vitest';
import { EASE_IN, EASE_OUT } from '../../../core/easing';
import { setKey, setKeysInterpolation, trackKey } from '../../../core/tracks';
import { selectedEase } from '../eases';

const target = { node: 'object', id: 'a', property: 'rotation' } as const;
const ref = (time: number) => ({ track: trackKey(target), time });

describe('характер выделенных ключей', () => {
  const base = setKey(setKey(setKey([], target, 0, [0]), target, 100, [1]), target, 200, [2]);

  it('один на всех — его значение, разные — пусто', () => {
    expect(selectedEase(base, [ref(0), ref(100)])).toBe('linear');
    const eased = setKeysInterpolation(base, [ref(0)], 'bezier', EASE_IN);
    expect(selectedEase(eased, [ref(0)])).toBe('in');
    expect(selectedEase(eased, [ref(0), ref(100)])).toBe('');
    expect(
      selectedEase(setKeysInterpolation(base, [ref(100)], 'bezier', EASE_OUT), [ref(100)]),
    ).toBe('out');
  });

  it('своя кривая, пропавшие ключи и пустое выделение — пусто', () => {
    const custom = setKeysInterpolation(base, [ref(0)], 'bezier', [0.1, 0.2, 0.3, 0.4]);
    expect(selectedEase(custom, [ref(0)])).toBe('');
    expect(selectedEase(base, [ref(999)])).toBe('');
    expect(selectedEase(base, [])).toBe('');
  });
});
