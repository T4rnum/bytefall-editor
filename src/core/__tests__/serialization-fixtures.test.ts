import { describe, expect, it } from 'vitest';
import { frameDocument } from '../animation';
import { getCell } from '../grid';
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
    expect(doc.objects[0]).toMatchObject({ id: 'object-star', layerId: 'layer-top', x: 2, y: 1 });
    expect(doc.objects[0].props).toEqual({ kind: 'decor', weight: 3, pinned: true });
  });

  it('v3: кадры сохраняют свою длительность и своё состояние объектов', () => {
    const anim = deserialize(v3);
    expect(anim.frames.map((f) => f.duration)).toEqual([120, 250]);
    expect(anim.background).toBeNull();
    expect(frameDocument(anim, 0).objects[0].x).toBe(1);
    expect(frameDocument(anim, 1).objects[0].x).toBe(3);
    // Слои общие для всех кадров, иначе операции над слоями разъедутся.
    expect(anim.frames[1].layers.map((l) => l.id)).toEqual(anim.frames[0].layers.map((l) => l.id));
  });

  it('v4: эффекты слоя читаются вместе с флагом enabled', () => {
    const effects = deserialize(v4).frames[0].layers[0].effects;
    expect(effects.map((e) => e.kind)).toEqual(['fire', 'pulse']);
    expect(effects[0]).toMatchObject({ kind: 'fire', height: 3, palette: 'fire', glyphs: '.:*#' });
    expect(effects[1].enabled).toBe(false);
  });

  it('файл прототипа BlendPhoto и файл Bytefall читаются одинаково', () => {
    expect(deserialize(v4).name).toBe('Fixture v4');
    expect(deserialize(v4bytefall).name).toBe('Fixture v4 current');
  });
});
