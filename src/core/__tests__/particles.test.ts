import { describe, expect, it } from 'vitest';
import { frameDocument } from '../animation';
import { makeCell } from '../cell';
import { TRANSPARENT } from '../color';
import { composite } from '../compositor';
import { type Deformer, type GlyphPose, createDeformer, deform } from '../deformers';
import { evaluate } from '../evaluate';
import { keyOf } from '../grid';
import { findObject, updateObject } from '../object';
import { MAX_PARTICLES, type ParticlesDeformer } from '../particles';
import { deserialize, serialize, toFileObject } from '../serialization';
import { bufferToText } from '../text';
import { DEFORMER_PARAMS, setKey } from '../tracks';
import { BALL, ballScene } from './helpers/ballScene';

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

/** Символ ячейки (x, y) объекта в покое. */
const pose = (x: number, y: number): GlyphPose => ({
  key: keyOf(x, y),
  particle: null,
  glyph: '#',
  x: x + 0.5,
  y: y + 0.5,
  rot: 0,
  sx: 1,
  sy: 1,
  fg: WHITE,
  bg: TRANSPARENT,
});

/** Десять частиц в секунду живут секунду и летят строго вверх без тяжести. */
const sparks = (patch: Partial<ParticlesDeformer> = {}): ParticlesDeformer => ({
  ...createDeformer('particles', 'p'),
  rate: 10,
  life: 1000,
  speed: 4,
  angle: -90,
  spread: 0,
  gravity: 0,
  ...patch,
});

/** Стек над символами в момент `time`. */
const run = (stack: readonly Deformer[], time: number, sources = [pose(0, 0)]) =>
  deform(
    sources.map((p) => ({ ...p })),
    stack,
    { time, center: { x: 0.5, y: 0.5 } },
  );

/** Только частицы, от младшей к старшей. */
const emit = (d: ParticlesDeformer, time: number, sources?: GlyphPose[]) =>
  run([d], time, sources)
    .filter((p) => p.particle !== null)
    .sort((a, b) => b.particle! - a.particle!);

describe('частицы', () => {
  it('живут от рождения до конца жизни: частота на жизнь, и уже в первый момент', () => {
    expect(emit(sparks(), 0)).toHaveLength(10);
    expect(emit(sparks(), 2000)).toHaveLength(10);
    expect(emit(sparks(), 2050)).toHaveLength(10);
    expect(emit(sparks({ life: 250 }), 2000)).toHaveLength(3);
    const [young] = emit(sparks(), 2000);
    expect(young).toMatchObject({ particle: 20, x: 0.5, y: 0.5 });
  });

  it('положение — формула от возраста: перемотка в любом порядке даёт то же самое', () => {
    const d = sparks();
    const first = emit(d, 1234);
    emit(d, 5000);
    expect(emit(d, 1234)).toEqual(first);
    // Частица 5 в 1000 мс прожила 0.5 с, в 1400 мс — 0.9 с: путь растёт с возрастом ровно.
    const at = (time: number) => emit(d, time).find((p) => p.particle === 5)!;
    expect((at(1000).y - 0.5) / 0.5).toBeCloseTo((at(1400).y - 0.5) / 0.9, 9);
    expect(at(1400).x).toBeCloseTo(0.5, 9);
    // Скорость частицы — от половины до полутора заданной.
    const v = (0.5 - at(1400).y) / 0.9;
    expect(v).toBeGreaterThanOrEqual(2);
    expect(v).toBeLessThan(6);
  });

  it('тяжесть тянет вниз, разброс раскрывает веер', () => {
    const fallen = emit(sparks({ speed: 0, gravity: 2 }), 2000);
    for (const p of fallen) expect(p.y).toBeCloseTo(0.5 + (2 - p.particle! / 10) ** 2, 9);
    const straight = new Set(emit(sparks(), 2000).map((p) => p.x.toFixed(6)));
    expect(straight.size).toBe(1);
    const fan = new Set(emit(sparks({ spread: 90 }), 2000).map((p) => p.x.toFixed(6)));
    expect(fan.size).toBeGreaterThan(5);
  });

  it('символ стареет по ряду, цвет идёт от первого ко второму и гаснет', () => {
    const d = sparks({ glyphs: '@*+.', from: '#ffffff', to: '#000000' });
    const all = emit(d, 2000);
    expect(all.map((p) => p.glyph).join('')).toBe('@@@**+++..');
    expect(all[0].fg).toEqual(WHITE);
    expect(all[9].fg.r).toBeCloseTo(0.1, 9);
    expect(all[9].fg.a).toBeCloseTo(0.1, 9);
    expect(all.every((p) => p.bg.a === 0)).toBe(true);
  });

  it('частицы вылетают из символов объекта и встают за ними; стек после них двигает и их', () => {
    const sources = [pose(0, 0), pose(3, 0), pose(6, 0)];
    const out = run([sparks({ speed: 0, rate: 100 })], 2000, sources);
    expect(out.slice(-3).map((p) => p.key)).toEqual(sources.map((p) => p.key));
    const born = out.slice(0, -3);
    expect(born.every((p) => sources.some((s) => s.key === p.key && s.x === p.x))).toBe(true);
    expect(new Set(born.map((p) => p.key)).size).toBe(3);
    // Дрожание после частиц: искры одной ячейки дрожат каждая по-своему.
    const jitter = { ...createDeformer('jitter', 'j'), amplitude: 0.5 };
    const shaken = run([sparks({ speed: 0 }), jitter], 2000, [pose(0, 0)]);
    const xs = new Set(shaken.filter((p) => p.particle !== null).map((p) => p.x.toFixed(6)));
    expect(xs.size).toBe(10);
  });

  it('без символов, без ряда и с нулевой частотой частиц нет; больше предела не бывает', () => {
    expect(run([sparks()], 2000, [])).toEqual([]);
    expect(emit(sparks({ glyphs: '' }), 2000)).toEqual([]);
    expect(emit(sparks({ rate: 0 }), 2000)).toEqual([]);
    const flood = emit(sparks({ rate: 1000, life: 10000 }), 3000);
    expect(flood).toHaveLength(MAX_PARTICLES);
    expect(flood[0].particle).toBe(3000);
  });
});

/** Мяч с частицами: символ `O` на синем фоне в (1, 1) сцены 8×4. */
function sparklingBall(d: ParticlesDeformer) {
  const { anim } = ballScene();
  const base = frameDocument(anim, 0);
  const cells = new Map([[keyOf(0, 0), makeCell('O', '#ffffff', '#0000ff')]]);
  const doc = updateObject(base, BALL, { cells, deformers: [d] });
  return { ...anim, frames: [{ ...anim.frames[0], objects: doc.objects }] };
}

describe('частицы в сцене', () => {
  it('в текст частица уходит символом без фона, объект остаётся поверх', () => {
    const anim = sparklingBall(sparks({ glyphs: '*' }));
    const buf = composite(evaluate(anim, 950), null, undefined, [], 950);
    const rows = bufferToText(buf).split('\n');
    expect(rows[1]).toBe(' O');
    expect(rows[0]).toBe(' *');
    // Фон остаётся только под мячом: у частиц его нет.
    expect(buf.bg[(0 * 8 + 1) * 4 + 3]).toBe(0);
    expect(buf.bg[(1 * 8 + 1) * 4 + 3]).toBe(1);
  });

  it('скорость, жизнь, разброс и тяжесть ведутся ключами, частота и зерно — нет', () => {
    expect(DEFORMER_PARAMS).toEqual(expect.arrayContaining(['life', 'speed', 'spread', 'gravity']));
    expect(DEFORMER_PARAMS).not.toContain('rate');
    const speed = { node: 'deformer', id: 'p', property: 'speed' } as const;
    const anim = sparklingBall(sparks());
    const keyed = { ...anim, tracks: setKey(setKey([], speed, 0, [0]), speed, 1000, [500]) };
    expect(findObject(evaluate(keyed, 500), BALL)!.deformers[0]).toMatchObject({ speed: 128 });
    expect(findObject(evaluate(keyed, 100), BALL)!.deformers[0]).toMatchObject({ speed: 50 });
  });

  it('частицы переживают сохранение, частота вне пределов файл не пройдёт', () => {
    const anim = sparklingBall(sparks({ glyphs: '*+', seed: 7 }));
    const back = deserialize(serialize(anim));
    expect(findObject(frameDocument(back, 0), BALL)!.deformers).toEqual([
      sparks({ glyphs: '*+', seed: 7 }),
    ]);
    const bad = toFileObject(anim);
    const d = bad.frames![0].objects![0].deformers![0];
    if (d.kind === 'particles') d.rate = 1000;
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/rate/);
  });
});
