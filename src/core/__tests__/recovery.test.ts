import { describe, expect, it } from 'vitest';
import { addFrame, createAnimation } from '../animation';
import { createDocument } from '../document';
import {
  isRecoverySlot,
  makeRecoverySlot,
  mergeRecoverySlots,
  recoverableSlots,
} from '../recovery';
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

describe('mergeRecoverySlots', () => {
  it('оставляет у сессии самую свежую запись из любого хранилища', () => {
    const stored = makeRecoverySlot('s1', anim(), 1000);
    const onExit = makeRecoverySlot('s1', anim(), 3000);
    const other = makeRecoverySlot('s2', anim(), 2000);
    const merged = mergeRecoverySlots([stored, other], [onExit]);
    expect(merged.map((s) => [s.session, s.savedAt])).toEqual([
      ['s1', 3000],
      ['s2', 2000],
    ]);
  });

  it('копия старше основной записи основную не вытесняет', () => {
    const stored = makeRecoverySlot('s1', anim(), 5000);
    const stale = makeRecoverySlot('s1', anim(), 1000);
    expect(mergeRecoverySlots([stored], [stale])).toEqual([stored]);
  });

  it('пропускает мусор в любом из списков', () => {
    const slot = makeRecoverySlot('s1', anim(), 1000);
    expect(mergeRecoverySlots([{ junk: true }], [null, slot])).toEqual([slot]);
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
