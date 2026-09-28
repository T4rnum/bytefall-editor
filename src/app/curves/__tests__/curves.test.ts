import { describe, expect, it } from 'vitest';
import { createAnimation, frameDocument } from '../../../core/animation';
import { createDocument } from '../../../core/document';
import { EASE_BACK } from '../../../core/easing';
import { addObject, createObject } from '../../../core/object';
import { type Track, createKey, trackKey } from '../../../core/tracks';
import { curveBounds, curveChannels, curveTracks } from '../curveChannels';
import { channelPath, handlePoints, keyPoints, keysInBox, nearest } from '../curveGeometry';
import {
  fitCurves,
  formatValue,
  fromScreen,
  niceStep,
  panView,
  ticksIn,
  toScreen,
  zoomView,
} from '../curveView';

const SIZE = { width: 400, height: 200 };
const VIEW = { t0: 0, t1: 1000, v0: -10, v1: 10 };

describe('взгляд редактора кривых', () => {
  it('время вправо, значение вверх; экран и обратно', () => {
    expect(toScreen(VIEW, SIZE, 500, 10)).toEqual({ x: 200, y: 0 });
    expect(toScreen(VIEW, SIZE, 0, -10)).toEqual({ x: 0, y: 200 });
    expect(fromScreen(VIEW, SIZE, 100, 150)).toEqual({ x: 250, y: -5 });
  });

  it('масштаб держит точку под указателем, оси — независимо', () => {
    const at = { x: 100, y: 50 };
    const before = fromScreen(VIEW, SIZE, at.x, at.y);
    const zoomed = zoomView(VIEW, SIZE, at, 2, 1);
    expect(zoomed.t1 - zoomed.t0).toBeCloseTo(500);
    expect(zoomed.v1 - zoomed.v0).toBeCloseTo(20);
    const after = fromScreen(zoomed, SIZE, at.x, at.y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    // Поле едет за указателем: вправо на 40 px — время назад на 100 мс.
    expect(panView(VIEW, SIZE, 40, 20)).toEqual({ t0: -100, t1: 900, v0: -8, v1: 12 });
  });

  it('вписывание с полем; плоская кривая и один ключ получают размах', () => {
    const fit = fitCurves({ t0: 0, t1: 1000, v0: 0, v1: 90 }, SIZE);
    expect(fit.t0).toBeLessThan(0);
    expect(fit.v1).toBeGreaterThan(90);
    const flat = fitCurves({ t0: 500, t1: 500, v0: 3, v1: 3 }, SIZE);
    expect(flat.t1 - flat.t0).toBeGreaterThan(1000);
    expect(flat.v1 - flat.v0).toBeGreaterThan(1);
    expect(fitCurves(null, SIZE)).toEqual({ t0: 0, t1: 2000, v0: -1, v1: 1 });
  });

  it('деления — круглые шаги, подписи — с запятой и без минус-нуля', () => {
    expect(niceStep(1000, 400, 60)).toBe(200);
    expect(niceStep(1, 200, 40)).toBe(0.2);
    expect(ticksIn(-0.3, 0.5, 0.2)).toEqual([-0.2, 0, 0.2, 0.4]);
    expect(formatValue(0.4, 0.2)).toBe('0,4');
    expect(formatValue(-0.0001, 0.2)).toBe('0,0');
    expect(formatValue(90, 20)).toBe('90');
  });
});

/** Мяч с ключами положения и поворота и слой с ключами непрозрачности. */
function scene() {
  let doc = createDocument({ width: 16, height: 8 });
  const layerId = doc.layers[0].id;
  doc = addObject(doc, createObject({ name: 'Мяч', layerId, id: 'ball', x: 0, y: 0 }));
  doc = addObject(doc, createObject({ name: 'Куб', layerId, id: 'box', x: 0, y: 0 }));
  const tracks: Track[] = [
    {
      node: 'object',
      id: 'ball',
      property: 'position',
      keys: [createKey(0, [0, 0], 'bezier', EASE_BACK), createKey(1000, [10, 4])],
    },
    {
      node: 'object',
      id: 'ball',
      property: 'rotation',
      keys: [createKey(0, [0], 'step'), createKey(500, [90])],
    },
    {
      node: 'layer',
      id: layerId,
      property: 'opacity',
      keys: [createKey(0, [1]), createKey(800, [0.5])],
    },
  ];
  const anim = { ...createAnimation(doc), tracks };
  return { anim, doc: frameDocument(anim, 0), tracks };
}

describe('каналы кривых', () => {
  it('только выбранное: треки объектов и выделенных ключей; ничего не выбрано — все', () => {
    const { anim, doc, tracks } = scene();
    expect(curveTracks(anim, doc, ['ball'], [], false)).toEqual(tracks.slice(0, 2));
    const keyed = [{ track: trackKey(tracks[2]), time: 0 }];
    expect(curveTracks(anim, doc, [], keyed, false)).toEqual([tracks[2]]);
    expect(curveTracks(anim, doc, [], [], false)).toBe(anim.tracks);
    expect(curveTracks(anim, doc, ['box'], [], true)).toBe(anim.tracks);
  });

  it('канал на число: подписи осей и цвета осей, одиночные числа — по кругу', () => {
    const { anim, doc, tracks } = scene();
    const channels = curveChannels(anim, doc, tracks);
    expect(channels.map((c) => [c.owner, c.label, c.color])).toEqual([
      ['Мяч', 'Положение X', 'var(--curve-x)'],
      ['Мяч', 'Положение Y', 'var(--curve-y)'],
      ['Мяч', 'Поворот', 'var(--curve-s1)'],
      ['Слой 1', 'Непрозрачность слоя', 'var(--curve-s2)'],
    ]);
  });

  it('вписывать — с перелётом ручек, а не только значения ключей', () => {
    const { anim, doc, tracks } = scene();
    const [x] = curveChannels(anim, doc, tracks);
    const bounds = curveBounds([x]);
    expect(bounds?.t0).toBe(0);
    expect(bounds?.t1).toBe(1000);
    // У «С перелётом» вторая опора на 1,56 пути: 15,6 при пути в 10.
    expect(bounds?.v1).toBeCloseTo(15.6);
    expect(curveBounds([])).toBeNull();
  });
});

describe('кривые на экране', () => {
  const { anim, doc, tracks } = scene();
  const channels = curveChannels(anim, doc, tracks);
  const map = (t: number, v: number) => toScreen({ t0: 0, t1: 1000, v0: 0, v1: 100 }, SIZE, t, v);

  it('переход по кривой — кубическая Безье, скачок — ступенька, края держат значение', () => {
    const x = channelPath(channels[0], map, -200, 1400);
    expect(x).toMatch(/^M-80 200 L0 200 C/);
    expect(x.endsWith('L560 180')).toBe(true);
    expect(channelPath(channels[2], map, 0, 1000)).toBe('M0 200 L0 200 L200 200 L200 20 L400 20');
  });

  it('точки ключей, ручки выделенных, попадание и рамка', () => {
    const points = keyPoints(channels, () => map);
    expect(points).toHaveLength(8);
    const ref = { track: trackKey(tracks[0]), time: 0 };
    const handles = handlePoints(channels, [ref], () => map);
    // Ручки выходят из ключа на обоих каналах положения; у скачка поворота их нет.
    expect(handles.map((h) => [h.channel.label, h.side])).toEqual([
      ['Положение X', 'out'],
      ['Положение Y', 'out'],
    ]);
    expect(nearest(points, 401, 181, 6)?.ref).toEqual({ ...ref, time: 1000 });
    expect(nearest(points, 50, 50, 6)).toBeNull();
    const boxed = keysInBox(points, { x: -5, y: 150, w: 10, h: 60 });
    expect(boxed).toHaveLength(3);
  });
});
