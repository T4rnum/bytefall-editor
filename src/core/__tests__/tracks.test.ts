import { describe, expect, it } from 'vitest';
import { EASE_OUT } from '../easing';
import { MAX_SCENE_DURATION } from '../time';
import {
  type Key,
  type Track,
  type TrackTarget,
  copyTracks,
  createKey,
  findTrack,
  keyIndexAt,
  keyTimes,
  moveKeys,
  removeKeys,
  replaceKeys,
  setKey,
  setKeysInterpolation,
  shiftPositionKeys,
  trackKey,
  tracksByNode,
  valueKind,
  withKey,
} from '../tracks';

const rotation: TrackTarget = { node: 'object', id: 'ball', property: 'rotation' };
const position: TrackTarget = { node: 'object', id: 'ball', property: 'position' };
const fade: TrackTarget = { node: 'layer', id: 'bg', property: 'opacity' };

const times = (keys: readonly Key[]): number[] => keys.map((k) => k.time);
const ref = (target: TrackTarget, time: number) => ({ track: trackKey(target), time });

function rotationTrack(...keys: [number, number][]): Track[] {
  let tracks: readonly Track[] = [];
  for (const [time, value] of keys) tracks = setKey(tracks, rotation, time, [value]);
  return [...tracks];
}

describe('ключи трека', () => {
  it('встают по времени, а ключ в тот же момент заменяет значение, не интерполяцию', () => {
    let keys = withKey([], 500, [1]);
    keys = withKey(keys, 100, [2]);
    keys = withKey(keys, 300, [3]);
    expect(times(keys)).toEqual([100, 300, 500]);
    keys[1] = { ...keys[1], interpolation: 'step' };
    keys = withKey(keys, 300, [9]);
    expect(keys[1]).toMatchObject({ time: 300, value: [9], interpolation: 'step' });
  });

  it('новый ключ берёт интерполяцию соседа слева, а первый — справа', () => {
    const smooth = { interpolation: 'bezier' as const, easing: EASE_OUT };
    const keys = [
      { ...createKey(100, [0]), ...smooth },
      { ...createKey(500, [1]), interpolation: 'step' as const },
    ];
    expect(withKey(keys, 300, [5])[1]).toMatchObject(smooth);
    expect(withKey(keys, 50, [5])[0]).toMatchObject(smooth);
    expect(withKey(keys, 900, [5])[2].interpolation).toBe('step');
  });

  it('время округляется до микросекунды: ключ и кадр экспорта совпадают ровно', () => {
    const keys = withKey([], 1000 / 3, [1]);
    expect(keys[0].time).toBe(333.333);
    expect(keyIndexAt(keys, 333.3333333)).toBe(0);
    expect(keyIndexAt(keys, 333.4)).toBe(-1);
  });

  it('трек появляется с первым ключом и исчезает с последним', () => {
    const tracks = setKey([], rotation, 0, [45]);
    expect(findTrack(tracks, rotation)?.keys).toHaveLength(1);
    expect(replaceKeys(tracks, rotation, [])).toEqual([]);
    expect(removeKeys(tracks, [ref(rotation, 0)])).toEqual([]);
  });

  it('удаление трогает только названные ключи названных треков', () => {
    let tracks = rotationTrack([0, 0], [100, 10], [200, 20]);
    tracks = [...setKey(tracks, fade, 100, [0.5])];
    const out = removeKeys(tracks, [ref(rotation, 100), ref(rotation, 999)]);
    expect(times(findTrack(out, rotation)!.keys)).toEqual([0, 200]);
    expect(findTrack(out, fade)).toBe(findTrack(tracks, fade));
    expect(removeKeys(tracks, [])).toBe(tracks);
  });
});

describe('сдвиг ключей', () => {
  it('сдвигает выделенные вместе и возвращает новое выделение', () => {
    const tracks = rotationTrack([0, 0], [100, 10], [200, 20]);
    const moved = moveKeys(tracks, [ref(rotation, 100), ref(rotation, 200)], 50);
    expect(times(findTrack(moved.tracks, rotation)!.keys)).toEqual([0, 150, 250]);
    expect(moved.refs.map((r) => r.time)).toEqual([150, 250]);
  });

  it('не уводит ни один ключ за начало сцены и сохраняет расстояния', () => {
    const tracks = rotationTrack([100, 10], [300, 30]);
    const moved = moveKeys(tracks, [ref(rotation, 100), ref(rotation, 300)], -500);
    expect(times(findTrack(moved.tracks, rotation)!.keys)).toEqual([0, 200]);
    const late = moveKeys(tracks, [ref(rotation, 300)], MAX_SCENE_DURATION);
    expect(findTrack(late.tracks, rotation)!.keys[1].time).toBe(MAX_SCENE_DURATION);
  });

  it('сдвинутый ключ заменяет тот, на чьё место встал', () => {
    const tracks = rotationTrack([0, 0], [100, 10], [200, 20]);
    const moved = moveKeys(tracks, [ref(rotation, 100)], 100);
    const keys = findTrack(moved.tracks, rotation)!.keys;
    expect(keys.map((k) => [k.time, k.value[0]])).toEqual([
      [0, 0],
      [200, 10],
    ]);
  });

  it('нулевой сдвиг ничего не меняет', () => {
    const tracks = rotationTrack([100, 10]);
    expect(moveKeys(tracks, [ref(rotation, 100)], 0).tracks).toBe(tracks);
    expect(moveKeys(tracks, [], 50).tracks).toBe(tracks);
  });
});

describe('треки целиком', () => {
  it('интерполяция меняется только у выделенных, кривая по желанию', () => {
    const tracks = rotationTrack([0, 0], [100, 10]);
    const out = setKeysInterpolation(tracks, [ref(rotation, 0)], 'bezier', EASE_OUT);
    const [first, second] = findTrack(out, rotation)!.keys;
    expect(first).toMatchObject({ interpolation: 'bezier', easing: EASE_OUT });
    expect(second.interpolation).toBe('linear');
    const step = setKeysInterpolation(out, [ref(rotation, 0)], 'step');
    expect(findTrack(step, rotation)!.keys[0]).toMatchObject({
      interpolation: 'step',
      easing: EASE_OUT,
    });
  });

  it('моменты всех ключей — без повторов и по возрастанию', () => {
    let tracks = rotationTrack([300, 0], [100, 1]);
    tracks = [...setKey(tracks, fade, 100, [1]), ...setKey([], position, 50, [0, 0])];
    expect(keyTimes(tracks)).toEqual([50, 100, 300]);
  });

  it('копия узла получает те же ключи под новым идентификатором', () => {
    const tracks = [...rotationTrack([0, 5]), ...setKey([], fade, 0, [1])];
    const out = copyTracks(tracks, 'object', new Map([['ball', 'ball-copy']]));
    expect(out).toHaveLength(3);
    expect(findTrack(out, { ...rotation, id: 'ball-copy' })?.keys).toEqual(tracks[0].keys);
    expect(copyTracks(tracks, 'object', new Map())).toBe(tracks);
  });

  it('сдвиг холста двигает ключи положения только названных объектов', () => {
    const tracks = [...setKey([], position, 0, [1, 2]), ...rotationTrack([0, 5])];
    const out = shiftPositionKeys(tracks, new Set(['ball']), 3, -1);
    expect(findTrack(out, position)!.keys[0].value).toEqual([4, 1]);
    expect(findTrack(out, rotation)).toBe(findTrack(tracks, rotation));
    expect(shiftPositionKeys(tracks, new Set(['other']), 3, 0)[0].keys[0].value).toEqual([1, 2]);
    expect(shiftPositionKeys(tracks, new Set(['ball']), 0, 0)).toBe(tracks);
  });

  it('треки узла собираются в словарь, общий для одного массива', () => {
    const tracks = [
      ...setKey(rotationTrack([0, 1]), position, 0, [0, 0]),
      ...setKey([], fade, 0, [1]),
    ];
    const index = tracksByNode(tracks);
    expect(index.get('object:ball')).toHaveLength(2);
    expect(index.get('layer:bg')).toHaveLength(1);
    expect(tracksByNode(tracks)).toBe(index);
  });

  it('вид значения следует из свойства', () => {
    expect(valueKind(position)).toBe('vec2');
    expect(valueKind(rotation)).toBe('scalar');
    expect(valueKind({ node: 'object', id: 'a', property: 'tint' })).toBe('color');
    expect(valueKind(fade)).toBe('scalar');
  });
});
