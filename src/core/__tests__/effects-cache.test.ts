import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import {
  type EffectKind,
  type LayerEffect,
  applyEffect,
  createEffect,
  effectSignature,
} from '../effects';
import { type CellGrid, type CellKey, applyEdits, emptyGrid, keyOf } from '../grid';

const ctx = { time: 0, width: 40, height: 20 };
const at = (time: number) => ({ ...ctx, time });

function sampleCells(): CellGrid {
  const edits = new Map<CellKey, ReturnType<typeof makeCell> | null>();
  for (let x = 0; x < 40; x += 2) {
    edits.set(keyOf(x, 18), makeCell('#', '#ffa300'));
    edits.set(keyOf(x, 19), makeCell('#', '#ff004d', '#101010'));
  }
  return applyEdits(emptyGrid(), edits);
}

/** Сетка как обычный объект: сравнивать удобнее, чем Map. */
const dump = (grid: CellGrid): unknown =>
  [...grid.entries()].sort(([a], [b]) => a - b).map(([k, c]) => [k, c.glyph, c.fg, c.bg]);

const KINDS: readonly EffectKind[] = ['pulse', 'wave', 'flicker', 'scroll', 'cycle', 'fire'];

describe('подпись эффекта', () => {
  it.each(KINDS)('%s: одинаковая подпись означает одинаковый кадр', (kind) => {
    const effect = createEffect(kind, `fx-${kind}`);
    const cells = sampleCells();
    // Считаем эффект в каждый момент и сверяем кадры внутри групп с одной подписью.
    const bySignature = new Map<string, unknown[]>();
    for (let time = 0; time < 2000; time += 7) {
      const fresh: LayerEffect = { ...effect };
      const signature = effectSignature(fresh, at(time));
      const frame = dump(applyEffect(cells, fresh, at(time)));
      const group = bySignature.get(signature);
      if (group) group.push(frame);
      else bySignature.set(signature, [frame]);
    }
    for (const frames of bySignature.values()) {
      for (const frame of frames) expect(frame).toEqual(frames[0]);
    }
  });

  it.each(KINDS)('%s: подпись меняется со временем, иначе эффект стоял бы на месте', (kind) => {
    const effect = createEffect(kind, `sig-${kind}`);
    const signatures = new Set<string>();
    for (let time = 0; time < 5000; time += 25) signatures.add(effectSignature(effect, at(time)));
    expect(signatures.size).toBeGreaterThan(1);
  });

  it('подпись учитывает размер холста: от него зависят перенос и обрезка', () => {
    const scroll = createEffect('scroll', 'fx');
    expect(effectSignature(scroll, { time: 500, width: 40, height: 20 })).not.toBe(
      effectSignature(scroll, { time: 500, width: 80, height: 20 }),
    );
  });
});

describe('кэш эффекта', () => {
  it('повторный вызов с теми же входами возвращает ту же сетку', () => {
    const effect = createEffect('fire', 'fx');
    const cells = sampleCells();
    const first = applyEffect(cells, effect, at(500));
    const second = applyEffect(cells, effect, at(500));
    expect(second).toBe(first);
  });

  it('внутри одного тика эффекта результат тот же самый объект', () => {
    const effect = createEffect('fire', 'fx');
    const cells = sampleCells();
    // Период огня по умолчанию 90 мс, значит тик 5 это промежуток 450..539.
    expect(effectSignature(effect, at(500))).toBe(effectSignature(effect, at(530)));
    expect(applyEffect(cells, effect, at(530))).toBe(applyEffect(cells, effect, at(500)));
  });

  it('смена тика пересчитывает эффект', () => {
    const effect = createEffect('fire', 'fx');
    const cells = sampleCells();
    const before = applyEffect(cells, effect, at(500));
    const after = applyEffect(cells, effect, at(1400));
    expect(after).not.toBe(before);
  });

  it('другая сетка пересчитывает эффект', () => {
    const effect = createEffect('fire', 'fx');
    const first = applyEffect(sampleCells(), effect, at(500));
    const second = applyEffect(sampleCells(), effect, at(500));
    expect(second).not.toBe(first);
    // Содержимое при этом совпадает: кэш не влияет на результат.
    expect(dump(second)).toEqual(dump(first));
  });

  it('правка параметра создаёт новый эффект и кэш к нему не относится', () => {
    const cells = sampleCells();
    const slow = createEffect('fire', 'fx');
    const fast: LayerEffect = { ...slow, period: 20 };
    const a = dump(applyEffect(cells, slow, at(500)));
    const b = dump(applyEffect(cells, fast, at(500)));
    expect(b).not.toEqual(a);
  });

  it('кэш не искажает кадр: результат совпадает с расчётом на чистом эффекте', () => {
    const cells = sampleCells();
    for (const kind of KINDS) {
      const warm = createEffect(kind, `warm-${kind}`);
      applyEffect(cells, warm, at(100));
      applyEffect(cells, warm, at(900));
      const cached = dump(applyEffect(cells, warm, at(1700)));
      const clean = dump(applyEffect(cells, createEffect(kind, `clean-${kind}`), at(1700)));
      expect(cached).toEqual(clean);
    }
  });
});
