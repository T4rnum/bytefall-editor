import { describe, expect, it } from 'vitest';
import { frameDocument } from '../animation';
import { getCell, keyOf } from '../grid';
import {
  FORMAT_NAME,
  FORMAT_VERSION,
  deserialize,
  serialize,
  toFileObject,
} from '../serialization';
import v1 from './fixtures/v1-single-frame.bp.json?raw';
import v2 from './fixtures/v2-objects.bp.json?raw';
import v3 from './fixtures/v3-frames.bp.json?raw';
import v4bytefall from './fixtures/v4-bytefall.bp.json?raw';
import v4 from './fixtures/v4-effects.bp.json?raw';
import v5 from './fixtures/v5-transforms.bp.json?raw';
import v6 from './fixtures/v6-tracks.bp.json?raw';
import v7 from './fixtures/v7-deformers.bp.json?raw';
import v8 from './fixtures/v8-material.bp.json?raw';
import v9 from './fixtures/v9-rig.bp.json?raw';
import v9links from './fixtures/v9-constraints.bp.json?raw';
import v9skin from './fixtures/v9-skin.bp.json?raw';
import { tintChannels } from '../animated';
import { EASE_IN_OUT } from '../easing';
import { sceneDuration } from '../timeline';

/**
 * Файлы в fixtures/ записаны руками и заморожены: они не пересобираются текущим кодом, поэтому
 * ловят молчаливое изменение формата. Новая версия схемы обязана добавить сюда свой файл.
 * Читаются как текст, а не через node:fs, чтобы ядро и его тесты не зависели от node API.
 */
const FIXTURES = {
  'v1-single-frame': v1,
  'v2-objects': v2,
  'v3-frames': v3,
  'v4-effects': v4,
  'v4-bytefall': v4bytefall,
  'v5-transforms': v5,
  'v6-tracks': v6,
  'v7-deformers': v7,
  'v8-material': v8,
  'v9-rig': v9,
  'v9-constraints': v9links,
  'v9-skin': v9skin,
} as const;

describe('фикстуры формата', () => {
  it.each(Object.entries(FIXTURES))('%s читается и переписывается текущей версией', (_, text) => {
    const anim = deserialize(text);
    const file = toFileObject(anim);
    expect(file.format).toBe(FORMAT_NAME);
    expect(file.version).toBe(FORMAT_VERSION);
    // Перезапись не теряет данные: повторное чтение даёт тот же документ.
    expect(deserialize(serialize(anim))).toEqual(anim);
  });

  it('v1: один кадр в корне становится анимацией из одного кадра', () => {
    const anim = deserialize(v1);
    expect(anim.frames).toHaveLength(1);
    expect(anim.frames[0].duration).toBe(100);
    expect(anim.frames[0].objects).toEqual([]);

    const doc = frameDocument(anim, 0);
    expect(doc.layers).toHaveLength(1);
    expect(getCell(doc.layers[0].cells, 1, 0)).toEqual({
      glyph: 'P',
      fg: '#ff004d',
      bg: '#000000',
    });
    expect(getCell(doc.layers[0].cells, 2, 1)?.attrs).toEqual({ glow: 2, tag: 'corner' });
    // Ячейка без глифа, но с фоном, остаётся в сетке: пустой её делает только отсутствие обоих.
    expect(getCell(doc.layers[0].cells, 5, 2)).toEqual({ glyph: '', fg: '#ffffff', bg: '#ff004d' });
  });

  it('v2: объекты из корня попадают в единственный кадр', () => {
    const doc = frameDocument(deserialize(v2), 0);
    expect(doc.layers.map((l) => l.id)).toEqual(['layer-base', 'layer-top']);
    expect(doc.layers[1]).toMatchObject({ locked: true, opacity: 0.5 });
    expect(doc.objects).toHaveLength(1);
    expect(doc.objects[0]).toMatchObject({
      id: 'object-star',
      layerId: 'layer-top',
      transform: { x: 2, y: 1 },
    });
    expect(doc.objects[0].props).toEqual({ kind: 'decor', weight: 3, pinned: true });
  });

  it('v3: кадры сохраняют свою длительность и своё состояние объектов', () => {
    const anim = deserialize(v3);
    expect(anim.frames.map((f) => f.duration)).toEqual([120, 250]);
    expect(anim.background).toBeNull();
    expect(frameDocument(anim, 0).objects[0].transform.x).toBe(1);
    expect(frameDocument(anim, 1).objects[0].transform.x).toBe(3);
    // Слои общие для всех кадров, иначе операции над слоями разъедутся.
    expect(anim.frames[1].layers.map((l) => l.id)).toEqual(anim.frames[0].layers.map((l) => l.id));
  });

  it('v4: эффекты слоя читаются вместе с флагом enabled', () => {
    const effects = deserialize(v4).frames[0].layers[0].effects;
    expect(effects.map((e) => e.kind)).toEqual(['fire', 'pulse']);
    expect(effects[0]).toMatchObject({ kind: 'fire', height: 3, palette: 'fire', glyphs: '.:*#' });
    expect(effects[1].enabled).toBe(false);
  });

  it('v5: трансформ, правки символов и родитель читаются как записаны', () => {
    const [arm, hand] = frameDocument(deserialize(v5), 0).objects;
    expect(arm.transform).toEqual({
      x: 4,
      y: 3,
      dx: 0.25,
      dy: -0.5,
      rot: 90,
      sx: 2,
      sy: 1,
      px: 1.5,
      py: 0.5,
    });
    expect(arm.parentId).toBeNull();
    expect([...arm.overrides.entries()]).toEqual([
      [keyOf(1, 0), { rot: 45, sx: 1.5, sy: 1.5 }],
      [keyOf(2, 0), { dy: 0.5 }],
    ]);
    expect(hand.parentId).toBe('object-arm');
    expect(hand.props).toEqual({ grip: true });
  });

  it('v6: частота, длина сцены, треки и вид объекта читаются как записаны', () => {
    const anim = deserialize(v6);
    expect(anim.fps).toBe(25);
    expect(anim.duration).toBe(1000);
    expect(anim.frames.map((f) => f.duration)).toEqual([200, 300]);
    const ball = frameDocument(anim, 0).objects[0];
    expect(ball).toMatchObject({ opacity: 0.75, tint: '#ff004d80' });
    // Во втором кадре вид не записан: значения по умолчанию.
    expect(frameDocument(anim, 1).objects[0]).toMatchObject({ opacity: 1, tint: null });

    expect(anim.tracks.map((t) => `${t.node}:${t.property}`)).toEqual([
      'object:position',
      'object:rotation',
      'object:opacity',
      'object:tint',
      'layer:opacity',
      'effect:height',
    ]);
    const [position, rotation, opacity, tint] = anim.tracks;
    expect(position.keys.map((k) => [k.time, k.value, k.interpolation])).toEqual([
      [0, [1, 1], 'linear'],
      [800, [7.5, 2], 'linear'],
    ]);
    expect(rotation.keys[0]).toMatchObject({ interpolation: 'bezier', easing: EASE_IN_OUT });
    expect(opacity.keys[0].interpolation).toBe('step');
    expect(tint.keys.map((k) => k.value)).toEqual([
      tintChannels('#ff004d00'),
      tintChannels('#ff004d'),
    ]);
  });

  it('v7: деформеры объекта читаются по порядку, с флагом и параметрами', () => {
    const [flag] = frameDocument(deserialize(v7), 0).objects;
    expect(flag.deformers.map((d) => [d.kind, d.enabled])).toEqual([
      ['wave', true],
      ['colorRamp', false],
    ]);
    expect(flag.deformers[0]).toMatchObject({ axis: 'y', amplitude: 0.5, wavelength: 4 });
    // До v7 деформеров не было: у объектов старых версий стек пустой.
    expect(frameDocument(deserialize(v6), 0).objects[0].deformers).toEqual([]);
  });

  it('v8: материал объекта читается, цвет приводится к нижнему регистру', () => {
    const [flag] = frameDocument(deserialize(v8), 0).objects;
    expect(flag.material).toEqual({
      outline: { color: '#000000', width: 2 },
      glow: { color: '#ffec27', radius: 0.5, strength: 1.5 },
      shine: null,
      dither: null,
    });
    // До v8 материала не было.
    expect(frameDocument(deserialize(v7), 0).objects[0].material).toBeNull();
  });

  it('v9: кости и контроллер рига читаются как записаны, сустав — в начале кости', () => {
    const [upper, lower, target] = frameDocument(deserialize(v9), 0).objects;
    expect(upper.rig).toEqual({ kind: 'bone', length: 3.5, limit: null });
    expect(lower).toMatchObject({ parentId: 'bone-upper', transform: { rot: 30, px: 0 } });
    expect(lower.rig).toEqual({ kind: 'bone', length: 3, limit: { min: 0, max: 150 } });
    expect(target.rig).toEqual({ kind: 'control' });
    // До v9 рига не было.
    expect(frameDocument(deserialize(v8), 0).objects[0].rig).toBeNull();
  });

  it('v9: связи объекта читаются как записаны, без них список пуст', () => {
    const doc = frameDocument(deserialize(v9links), 0);
    expect(doc.objects.find((o) => o.id === 'bone-lower')!.constraints).toEqual([
      { id: 'link-ik', kind: 'ik', enabled: true, target: 'control-hand', chain: 2 },
    ]);
    expect(doc.objects.find((o) => o.id === 'object-tail')!.constraints).toEqual([
      { id: 'link-follow', kind: 'follow', enabled: true, delay: 120 },
      { id: 'link-aim', kind: 'aim', enabled: false, target: null, lag: 40 },
    ]);
    expect(frameDocument(deserialize(v9), 0).objects[0].constraints).toEqual([]);
  });

  it('v9: скиннинг читается с позой покоя костей и мягкостью', () => {
    const [sleeve, upper] = frameDocument(deserialize(v9skin), 0).objects;
    const [skin] = sleeve.deformers;
    expect(skin.kind === 'skin' && skin.falloff).toBe(1.5);
    expect(skin.kind === 'skin' && skin.bones.map((b) => [b.id, b.length])).toEqual([
      ['bone-upper', 3.5],
      ['bone-lower', 3],
    ]);
    expect(skin.kind === 'skin' && skin.bones[1].bind.e).toBe(3.5);
    expect(upper.parentId).toBe('object-sleeve');
  });

  it('до v6: частота по умолчанию, длина по кадрам, треков нет, объекты без оттенка', () => {
    const anim = deserialize(v3);
    expect(anim.fps).toBe(20);
    expect(anim.duration).toBeNull();
    expect(anim.tracks).toEqual([]);
    // Кадры — это спрайт-трек: сцена длится ровно столько, сколько шли кадры.
    expect(sceneDuration(anim)).toBe(370);
    expect(frameDocument(anim, 0).objects[0]).toMatchObject({ opacity: 1, tint: null });
  });

  it('до v5: позиция становится трансформом без поворота с опорой в центре содержимого', () => {
    const star = frameDocument(deserialize(v2), 0).objects[0];
    // Две ячейки в строку: центр — на стыке, посередине высоты.
    expect(star.transform).toEqual({
      x: 2,
      y: 1,
      dx: 0,
      dy: 0,
      rot: 0,
      sx: 1,
      sy: 1,
      px: 1,
      py: 0.5,
    });
    expect(star.overrides.size).toBe(0);
    expect(star.parentId).toBeNull();
  });

  it('файл прототипа BlendPhoto и файл Bytefall читаются одинаково', () => {
    expect(deserialize(v4).name).toBe('Fixture v4');
    expect(deserialize(v4bytefall).name).toBe('Fixture v4 current');
  });
});
