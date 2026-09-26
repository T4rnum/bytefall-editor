import type { Animation, Frame } from './animation';
import { isDeformed } from './deformObject';
import { hasActiveEffects } from './effects';
import { valueAt } from './interpolate';
import { isAnimatedMaterial } from './material';
import { MAX_SCENE_DURATION, roundTime } from './time';

/**
 * Время сцены и спрайт-трек. Кадры анимации — это спрайт-трек: кадр держится свою длительность,
 * и в момент `t` показывается тот, чьё время идёт. Если сцена длиннее кадров, они идут по кругу,
 * как спрайт в игре: цикл ходьбы повторяется, пока ключи ведут персонажа через экран.
 */

/** Пока длину не задали руками, сцена с движением длится не меньше двух секунд. */
export const MIN_MOTION_DURATION = 2000;

export interface SpriteTiming {
  /** Начало каждого кадра на первом круге. */
  readonly starts: readonly number[];
  /** Сумма длительностей кадров. */
  readonly length: number;
}

const timingCache = new WeakMap<readonly Frame[], SpriteTiming>();

export function spriteTiming(frames: readonly Frame[]): SpriteTiming {
  let timing = timingCache.get(frames);
  if (!timing) {
    const starts: number[] = [];
    let length = 0;
    for (const frame of frames) {
      starts.push(length);
      length += frame.duration;
    }
    timing = { starts, length };
    timingCache.set(frames, timing);
  }
  return timing;
}

/** Индекс последнего начала, не позже `t`. */
function startIndex(starts: readonly number[], t: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Кадр спрайт-трека, который показан в момент `time`. */
export function frameIndexAt(anim: Animation, time: number): number {
  const { starts, length } = spriteTiming(anim.frames);
  return startIndex(starts, time > 0 ? time % length : 0);
}

/** Начало кадра на первом круге: туда встаёт указатель, когда кадр выбирают. */
export function frameStart(anim: Animation, index: number): number {
  const { starts } = spriteTiming(anim.frames);
  return starts[Math.max(0, Math.min(starts.length - 1, index))];
}

const motionCache = new WeakMap<Animation, boolean>();

/**
 * Меняется ли картинка между кадрами спрайт-трека: есть трек хотя бы с двумя ключами или
 * включённый эффект на видимом слое. Тогда сцену показывают и экспортируют с частотой кадров,
 * а не кадр спрайта за кадром.
 */
export function hasMotion(anim: Animation): boolean {
  let motion = motionCache.get(anim);
  if (motion === undefined) {
    motion =
      anim.tracks.some((t) => t.keys.length > 1) ||
      anim.frames[0].layers.some((l) => l.visible && hasActiveEffects(l.effects)) ||
      anim.frames.some((f) =>
        f.objects.some((o) => o.visible && (isDeformed(o) || isAnimatedMaterial(o.material))),
      );
    motionCache.set(anim, motion);
  }
  return motion;
}

/**
 * Длина сцены. Заданная руками берётся как есть. Иначе — до конца кадров или последнего ключа, а
 * у сцены с движением не меньше `MIN_MOTION_DURATION`: у одного кадра с огнём длина кадра —
 * десятая доля секунды, и петля из неё ничего бы не показала.
 */
export function sceneDuration(anim: Animation): number {
  if (anim.duration !== null) return anim.duration;
  let end = spriteTiming(anim.frames).length;
  for (const track of anim.tracks) end = Math.max(end, track.keys[track.keys.length - 1].time);
  if (hasMotion(anim)) end = Math.max(end, MIN_MOTION_DURATION);
  return Math.min(MAX_SCENE_DURATION, end);
}

/** Моменты, где в пределах `[0, end)` начинается показ кадра спрайт-трека. */
export function spriteBoundaries(anim: Animation, end: number): number[] {
  const { starts, length } = spriteTiming(anim.frames);
  const out: number[] = [];
  for (let loop = 0; loop < end; loop += length) {
    for (const start of starts) {
      const t = loop + start;
      if (t >= end) return out;
      out.push(t);
    }
  }
  return out;
}

/**
 * Такт частоты кадров, не позже `time`. Моменты тактов округлены до микросекунды, поэтому
 * такт 333.333 чуть раньше настоящей трети секунды: допуск не даёт ему съехать на предыдущий.
 */
export function tickAt(fps: number, time: number): number {
  const step = 1000 / fps;
  return roundTime(Math.floor(time / step + 1e-4) * step);
}

export interface TimeSample {
  readonly time: number;
  /** Сколько показывать, в миллисекундах. */
  readonly delay: number;
}

/**
 * Моменты, которые попадут в экспорт. Без движения — начало каждого показа кадра со своей
 * длительностью, ровно как в покадровой анимации. С движением — такты частоты кадров сцены:
 * проигрывание на экране показывает те же моменты, поэтому GIF совпадает с экраном.
 */
export function exportSamples(anim: Animation): TimeSample[] {
  const end = sceneDuration(anim);
  let times: number[];
  if (hasMotion(anim)) {
    const step = 1000 / anim.fps;
    const count = Math.max(1, Math.ceil(end / step - 1e-9));
    times = Array.from({ length: count }, (_, i) => roundTime(i * step));
  } else {
    times = spriteBoundaries(anim, end);
  }
  return times.map((time, i) => ({ time, delay: roundTime((times[i + 1] ?? end) - time) }));
}

/** Момент, который показывает проигрывание в момент `time`: последний момент экспорта до него. */
export function sampleTimeAt(anim: Animation, time: number): number {
  if (hasMotion(anim)) return tickAt(anim.fps, time);
  const { starts, length } = spriteTiming(anim.frames);
  const loop = time > 0 ? Math.floor(time / length) * length : 0;
  return roundTime(loop + starts[frameIndexAt(anim, time)]);
}

/**
 * Начало соседнего показа кадра: шаг по кадрам спрайт-трека сквозь круги до конца сцены и
 * с переходом через край. За концом сцены шаг идёт дальше по кругам: туда можно встать, чтобы
 * поставить ключ позже, чем кончается сцена.
 */
export function adjacentFrameTime(anim: Animation, time: number, direction: 1 | -1): number {
  const end = sceneDuration(anim);
  const limit = time >= end ? time + spriteTiming(anim.frames).length + 1 : end;
  const times = spriteBoundaries(anim, limit);
  if (direction > 0) return times.find((t) => t > time) ?? 0;
  for (let i = times.length - 1; i >= 0; i--) if (times[i] < time) return times[i];
  return times[times.length - 1] ?? 0;
}

const closedCache = new WeakMap<Animation, boolean>();

/**
 * Сцена замкнута: каждый трек в конце петли там же, где в начале. Такую сцену можно крутить
 * по кругу без прыжка, и прошлое до её начала — это конец предыдущего круга. Кадры спрайта
 * идут по кругу всегда, поэтому решают только ключи.
 */
export function isClosedLoop(anim: Animation): boolean {
  const known = closedCache.get(anim);
  if (known !== undefined) return known;
  const end = sceneDuration(anim);
  const closed = anim.tracks.every((track) => {
    const from = valueAt(track, 0);
    const to = valueAt(track, end);
    return from.every((v, i) => Math.abs(v - to[i]) < 1e-6);
  });
  closedCache.set(anim, closed);
  return closed;
}
