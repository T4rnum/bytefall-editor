import type { Point } from './geometry';
import type { AngleLimit } from './rig';

/**
 * Звено цепочки IK: отрезок от сустава кости к суставу следующей, у последней — к её концу.
 * `offset` — угол между осью кости и этим отрезком: у цепочки, соединённой встык, он ноль.
 */
export interface IkLink {
  readonly length: number;
  readonly offset: number;
  readonly limit: AngleLimit | null;
}

const RAD = Math.PI / 180;
const ITERATIONS = 16;
const TOLERANCE = 1e-4;

/** Угол в пределах (−180, 180]. */
export const wrapAngle = (deg: number): number => deg - 360 * Math.ceil((deg - 180) / 360);

const angleTo = (from: Point, to: Point): number => Math.atan2(to.y - from.y, to.x - from.x) / RAD;

const step = (from: Point, deg: number, length: number): Point => ({
  x: from.x + Math.cos(deg * RAD) * length,
  y: from.y + Math.sin(deg * RAD) * length,
});

/** Точка на расстоянии `length` от `from` в сторону `toward`; совпавшие точки держат прежний угол. */
function reach(from: Point, toward: Point, length: number, fallback: number): Point {
  const far = Math.hypot(toward.x - from.x, toward.y - from.y) > 1e-12;
  return step(from, far ? angleTo(from, toward) : fallback, length);
}

/**
 * FABRIK (DESIGN.md, раздел 4.4): звенья держат длину, конец тянется к цели, начало стоит на
 * месте. Проход от конца ставит конец в цель, проход от начала возвращает начало и держит
 * пределы суставов. Недостижимая цель вытягивает цепочку в её сторону.
 *
 * @param angles мировые углы костей сейчас, градусы: с них начинается поиск
 * @param parentAngle мировой угол родителя первой кости: от него считается её предел
 * @returns мировые углы костей после решения, градусы
 */
export function solveFabrik(
  root: Point,
  links: readonly IkLink[],
  angles: readonly number[],
  parentAngle: number,
  target: Point,
): number[] {
  const n = links.length;
  const bones = angles.slice();
  const joints: Point[] = [root];
  links.forEach((link, i) => joints.push(step(joints[i], bones[i] + link.offset, link.length)));
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    joints[n] = target;
    for (let i = n - 1; i >= 0; i--) {
      joints[i] = reach(
        joints[i + 1],
        joints[i],
        links[i].length,
        bones[i] + links[i].offset + 180,
      );
    }
    joints[0] = root;
    for (let i = 0; i < n; i++) {
      const link = links[i];
      let bone = angleOrKeep(joints[i], joints[i + 1], bones[i] + link.offset) - link.offset;
      if (link.limit) {
        const parent = i === 0 ? parentAngle : bones[i - 1];
        const relative = wrapAngle(bone - parent);
        bone = parent + Math.min(link.limit.max, Math.max(link.limit.min, relative));
      }
      bones[i] = bone;
      joints[i + 1] = step(joints[i], bone + link.offset, link.length);
    }
    if (Math.hypot(joints[n].x - target.x, joints[n].y - target.y) < TOLERANCE) break;
  }
  return bones;
}

/** Угол от точки к точке; если они совпали, остаётся прежний. */
function angleOrKeep(from: Point, to: Point, keep: number): number {
  return Math.hypot(to.x - from.x, to.y - from.y) > 1e-12 ? angleTo(from, to) : keep;
}
