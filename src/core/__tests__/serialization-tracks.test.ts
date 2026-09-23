import { describe, expect, it } from 'vitest';
import { frameDocument } from '../animation';
import { updateLayer } from '../document';
import { createEffect } from '../effects';
import { EASE_BACK } from '../easing';
import { updateObject } from '../object';
import {
  DocumentFormatError,
  FORMAT_VERSION,
  deserialize,
  serialize,
  toFileObject,
} from '../serialization';
import { setKey, setKeysInterpolation, trackKey } from '../tracks';
import { BALL, rollingBall } from './helpers/ballScene';

/** Файл анимации с катящимся мячом, чтобы портить его по частям. */
function ballFile() {
  return JSON.parse(serialize(rollingBall().anim)) as ReturnType<typeof toFileObject>;
}

const load = (file: unknown) => () => deserialize(JSON.stringify(file));

describe('треки в файле', () => {
  it('переживают сохранение без потерь: интерполяция, кривая, частота и длина', () => {
    const { anim, layerId } = rollingBall();
    const position = { node: 'object', id: BALL, property: 'position' } as const;
    let tracks = setKeysInterpolation(
      anim.tracks,
      [{ track: trackKey(position), time: 0 }],
      'bezier',
      EASE_BACK,
    );
    tracks = setKey(tracks, { node: 'object', id: BALL, property: 'tint' }, 250, [1, 0, 0.5, 0.2]);
    tracks = setKey(tracks, { node: 'layer', id: layerId, property: 'opacity' }, 900, [0.5]);
    const saved = { ...anim, tracks, fps: 30, duration: 1500 };
    const file = toFileObject(saved);
    expect(file.version).toBe(FORMAT_VERSION);
    expect(file.tracks?.[0].keys[0]).toEqual({ t: 0, v: [1, 1], i: 'bezier', e: [...EASE_BACK] });
    // Линейная интерполяция по умолчанию в файл не пишется.
    expect(file.tracks?.[0].keys[1]).toEqual({ t: 1000, v: [5, 1] });
    const back = deserialize(serialize(saved));
    expect(back.fps).toBe(30);
    expect(back.duration).toBe(1500);
    expect(back.tracks.map((t) => trackKey(t))).toEqual(tracks.map((t) => trackKey(t)));
    // Оттенок — цвет с силой: восемь бит на канал, как любой цвет в файле.
    expect(back.tracks[1].keys[0].value.map((v) => Math.round(v * 255))).toEqual([255, 0, 128, 51]);
  });

  it('вид объекта сохраняется, а по умолчанию не пишется', () => {
    const { anim } = rollingBall();
    const plain = toFileObject(anim).frames?.[0].objects?.[0];
    expect(plain).not.toHaveProperty('opacity');
    expect(plain).not.toHaveProperty('tint');
    const doc = updateObject(frameDocument(anim, 0), BALL, { opacity: 0.4, tint: '#00FF0080' });
    const styled = { ...anim, frames: [{ ...anim.frames[0], objects: doc.objects }] };
    const obj = frameDocument(deserialize(serialize(styled)), 0).objects[0];
    expect(obj).toMatchObject({ opacity: 0.4, tint: '#00ff0080' });
  });

  it('без треков файл их не пишет', () => {
    const file = toFileObject({ ...rollingBall().anim, tracks: [] });
    expect(file).not.toHaveProperty('tracks');
    expect(file).not.toHaveProperty('duration');
  });
});

describe('испорченные треки', () => {
  const broken: [string, (file: ReturnType<typeof ballFile>) => void][] = [
    ['свойство не того узла', (f) => (f.tracks![0].property = 'wavelength')],
    ['неизвестный узел', (f) => ((f.tracks![0] as { node: string }).node = 'camera')],
    ['пара вместо числа', (f) => (f.tracks![0].property = 'rotation')],
    ['число вместо цвета', (f) => (f.tracks![0].property = 'tint')],
    ['значение за пределами', (f) => (f.tracks![0].keys[0].v = [5000, 0])],
    ['ключи не по порядку', (f) => (f.tracks![0].keys[1].t = 0)],
    ['момент за пределом сцены', (f) => (f.tracks![0].keys[1].t = 1e9)],
    ['трек в никуда', (f) => (f.tracks![0].id = 'ghost')],
    ['трек дважды', (f) => f.tracks!.push(f.tracks![0])],
    ['кривая назад во времени', (f) => (f.tracks![0].keys[0].e = [-1, 0, 1, 1])],
    ['частота за пределами', (f) => (f.fps = 1000)],
  ];

  it.each(broken)('%s — ошибка формата, а не молча выброшенная анимация', (_, spoil) => {
    const file = ballFile();
    spoil(file);
    expect(load(file)).toThrow(DocumentFormatError);
  });
});

describe('эффекты старых файлов', () => {
  it('копия слоя с общими идентификаторами эффектов получает свои, одни на все кадры', () => {
    const { anim, layerId } = rollingBall(2);
    const fire = createEffect('fire', 'fx-shared');
    const withFire = anim.frames.map((frame) => {
      const doc = updateLayer(frameDocument(anim, 0), layerId, { effects: [fire] });
      const copy = { ...doc.layers[0], id: 'layer-copy', name: 'Copy' };
      return { ...frame, layers: [...doc.layers, copy] };
    });
    const loaded = deserialize(serialize({ ...anim, frames: withFire }));
    const ids = loaded.frames.map((f) => f.layers.map((l) => l.effects[0].id));
    expect(ids[0][0]).toBe('fx-shared');
    expect(ids[0][1]).not.toBe('fx-shared');
    expect(ids[1]).toEqual(ids[0]);
  });
});
