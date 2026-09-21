import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { parseHex } from '../color';
import { composite } from '../compositor';
import { createDocument, setLayerCells, updateLayer } from '../document';
import {
  type EffectContext,
  applyEffect,
  applyEffects,
  createEffect,
  hasActiveEffects,
  hashNoise,
} from '../effects';
import { applyEdits, editsFromPoints, emptyGrid, getCell, keyOf } from '../grid';
import { linePoints } from '../shapes';

const ctx = (time: number): EffectContext => ({ time, width: 16, height: 8 });
const row = () =>
  applyEdits(emptyGrid(), editsFromPoints(linePoints(2, 6, 9, 6), makeCell('#', '#808080')));

describe('hashNoise', () => {
  it('is deterministic and spread over 0..1', () => {
    expect(hashNoise(3, 4, 5)).toBe(hashNoise(3, 4, 5));
    expect(hashNoise(3, 4, 5)).not.toBe(hashNoise(3, 4, 6));
    const samples = Array.from({ length: 200 }, (_, i) => hashNoise(i, i * 7, 1));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThan(1);
    expect(samples.filter((v) => v < 0.5).length).toBeGreaterThan(60);
  });
});

describe('pulse / flicker / cycle keep cells in place', () => {
  it('pulse scales brightness within bounds', () => {
    const fx = { ...createEffect('pulse', 'p'), amplitude: 0.5, spread: 0 };
    const bright = applyEffect(row(), fx, ctx(fx.period / 4));
    const dark = applyEffect(row(), fx, ctx((3 * fx.period) / 4));
    expect(parseHex(getCell(bright, 2, 6)!.fg).r).toBeGreaterThan(0.6);
    expect(parseHex(getCell(dark, 2, 6)!.fg).r).toBeLessThan(0.4);
    expect(bright.size).toBe(8);
  });

  it('flicker hides roughly the requested share of cells and none at density 0', () => {
    const cells = applyEdits(
      emptyGrid(),
      new Map(
        Array.from({ length: 400 }, (_, i) => [keyOf(i % 20, Math.floor(i / 20)), makeCell('x')]),
      ),
    );
    const fx = { ...createEffect('flicker', 'f'), density: 0.25 };
    const hidden = 400 - applyEffect(cells, fx, { time: 500, width: 20, height: 20 }).size;
    expect(hidden).toBeGreaterThan(50);
    expect(hidden).toBeLessThan(150);
    expect(applyEffect(cells, { ...fx, density: 0 }, ctx(0)).size).toBe(400);
  });

  it('cycle walks through the glyph string over time', () => {
    const fx = { ...createEffect('cycle', 'c'), glyphs: 'ab', period: 100, spread: 0 };
    expect(getCell(applyEffect(row(), fx, ctx(0)), 2, 6)?.glyph).toBe('a');
    expect(getCell(applyEffect(row(), fx, ctx(150)), 2, 6)?.glyph).toBe('b');
    const cells = row();
    expect(applyEffect(cells, { ...fx, glyphs: '' }, ctx(0))).toBe(cells);
  });
});

describe('wave / scroll move cells', () => {
  it('wave shifts rows vertically and clips outside the canvas', () => {
    const fx = { ...createEffect('wave', 'w'), amplitude: 1, wavelength: 4 };
    const moved = applyEffect(row(), fx, ctx(fx.period / 4));
    const ys = [...moved.keys()].map((k) => Math.floor(k / 65536));
    expect(new Set(ys).size).toBeGreaterThan(1);
    const tall = { ...fx, amplitude: 20 };
    expect(applyEffect(row(), tall, ctx(fx.period / 4)).size).toBeLessThan(8);
  });

  it('scroll wraps around or clips', () => {
    const wrap = { ...createEffect('scroll', 's'), dx: 10, dy: 0, wrap: true };
    const shifted = applyEffect(row(), wrap, ctx(1000));
    expect(getCell(shifted, 12, 6)?.glyph).toBe('#');
    expect(getCell(shifted, 3, 6)?.glyph).toBe('#');
    const clip = { ...wrap, wrap: false };
    expect(applyEffect(row(), clip, ctx(1000)).size).toBe(4);
    const cells = row();
    expect(applyEffect(cells, clip, ctx(0))).toBe(cells);
  });
});

describe('fire', () => {
  it('adds flames above the top edge, deterministic per time, never over content', () => {
    const fx = createEffect('fire', 'fire');
    const burning = applyEffect(row(), fx, ctx(300));
    expect(burning.size).toBeGreaterThan(8);
    for (const key of burning.keys()) {
      const y = Math.floor(key / 65536);
      expect(y).toBeLessThanOrEqual(6);
      expect(y).toBeGreaterThanOrEqual(6 - fx.height);
    }
    expect(getCell(burning, 2, 6)?.glyph).toBe('#');
    expect(applyEffect(row(), fx, ctx(300))).toEqual(burning);
    expect(applyEffect(row(), fx, ctx(300 + fx.period))).not.toEqual(burning);
  });
});

describe('applyEffects and composite', () => {
  it('skips disabled effects and composites with time', () => {
    const disabled = { ...createEffect('scroll', 's'), enabled: false };
    const cells = row();
    expect(applyEffects(cells, [disabled], ctx(1000))).toBe(cells);
    expect(hasActiveEffects([disabled])).toBe(false);

    let doc = createDocument({ width: 16, height: 8 });
    const layerId = doc.layers[0].id;
    doc = setLayerCells(doc, layerId, row());
    doc = updateLayer(doc, layerId, {
      effects: [{ ...createEffect('scroll', 's'), dx: 1, dy: 0, wrap: false }],
    });
    const still = composite(doc);
    const later = composite(doc, null, undefined, [], 1000);
    expect(still.glyphs[6 * 16 + 2]).toBe('#');
    expect(later.glyphs[6 * 16 + 2]).toBe('');
    expect(later.glyphs[6 * 16 + 3]).toBe('#');
  });
});
