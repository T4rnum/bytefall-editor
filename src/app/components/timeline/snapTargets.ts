import type { Animation } from '../../../core/animation';
import { sceneDuration, spriteBoundaries } from '../../../core/timeline';
import { type KeyRef, type Track, trackKey } from '../../../core/tracks';
import type { SnapTargets } from '../../timeline/timelineMath';

/** Насколько близко к цели надо подвести указатель, в пикселях. */
const SNAP_PX = 6;

/**
 * Куда тянет указатель или сдвигаемые ключи: начала кадров, конец сцены, указатель времени и
 * ключи, кроме тех, что двигаются сами, — к себе привязываться незачем.
 */
export function snapTargets(
  anim: Animation,
  tracks: readonly Track[],
  scale: number,
  span: number,
  options: { readonly playhead?: number; readonly moving?: readonly KeyRef[] } = {},
): SnapTargets {
  const moving = new Set((options.moving ?? []).map((r) => `${r.track}@${r.time}`));
  const points = [0, sceneDuration(anim), ...spriteBoundaries(anim, span)];
  if (options.playhead !== undefined) points.push(options.playhead);
  for (const track of tracks) {
    const key = trackKey(track);
    for (const k of track.keys) if (!moving.has(`${key}@${k.time}`)) points.push(k.time);
  }
  return { points, step: 1000 / anim.fps, tolerance: SNAP_PX / scale };
}
