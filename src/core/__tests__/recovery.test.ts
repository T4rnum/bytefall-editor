import { describe, expect, it } from 'vitest';
import { addFrame, createAnimation } from '../animation';
import { createDocument } from '../document';
import { isRecoverySlot, makeRecoverySlot, recoverableSlots } from '../recovery';
import { deserialize } from '../serialization';

const anim = () => createAnimation(createDocument({ name: 'Sketch', width: 12, height: 6 }));

describe('makeRecoverySlot', () => {
  it('кладёт документ в формате файла и описание для окна восстановления', () => {
    const source = addFrame(anim(), 0, 'duplicate');
    const slot = makeRecoverySlot('s1', source, 1000);
    expect(slot).toMatchObject({
      session: 's1',
      savedAt: 1000,
      name: 'Sketch',
      width: 12,
      height: 6,
      frames: 2,
    });
    // Запись читается тем же разбором, что и файл, со всеми его проверками и миграциями.
    expect(deserialize(slot.data).frames).toHaveLength(2);
  });
});

describe('isRecoverySlot', () => {
  it('отбрасывает мусор из хранилища', () => {
    const slot = makeRecoverySlot('s1', anim(), 1000);
    expect(isRecoverySlot(slot)).toBe(true);
    expect(isRecoverySlot(null)).toBe(false);
    expect(isRecoverySlot({ ...slot, width: -1 })).toBe(false);
    expect(isRecoverySlot({ ...slot, data: 42 })).toBe(false);
    expect(isRecoverySlot({ ...slot, session: '' })).toBe(false);
  });
});

describe('recoverableSlots', () => {
  const older = makeRecoverySlot('dead-1', anim(), 1000);
  const newer = makeRecoverySlot('dead-2', anim(), 5000);
  const alive = makeRecoverySlot('alive', anim(), 9000);

  it('предлагает записи умерших вкладок, свежие первыми', () => {
    const result = recoverableSlots([older, alive, newer], new Set(['alive']));
    expect(result.map((s) => s.session)).toEqual(['dead-2', 'dead-1']);
  });

  it('пропускает повреждённые записи, а не падает на них', () => {
    expect(recoverableSlots([{ junk: true }, older], new Set())).toEqual([older]);
  });

  it('без живых вкладок предлагает всё', () => {
    expect(recoverableSlots([alive], new Set())).toEqual([alive]);
  });
});
