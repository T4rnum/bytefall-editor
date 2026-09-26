import { type Affine, applyAffine, multiply } from './affine';
import { type Constraint, type Pose, aimKey, isTemporal } from './constraints';
import type { Document } from './document';
import type { Point } from './geometry';
import { type IkLink, solveFabrik, wrapAngle } from './ik';
import type { SceneObject } from './object';
import { transformMatrix } from './transform';

const DEG = 180 / Math.PI;
const angleOf = (m: Affine): number => Math.atan2(m.b, m.a) * DEG;
const pivotOf = (obj: SceneObject, world: Affine): Point =>
  applyAffine(world, obj.transform.px, obj.transform.py);

/**
 * Поворачивает мир объекта вокруг опоры так, чтобы его ось X стояла под углом `offset` к
 * направлению на точку.
 */
function aimAt(world: Affine, pivot: Point, point: Point, offset: number): Affine {
  if (Math.hypot(point.x - pivot.x, point.y - pivot.y) < 1e-9) return world;
  const toward = Math.atan2(point.y - pivot.y, point.x - pivot.x) + offset / DEG;
  const turn = toward - Math.atan2(world.b, world.a);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const around: Affine = {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: pivot.x - cos * pivot.x + sin * pivot.y,
    f: pivot.y - sin * pivot.x - cos * pivot.y,
  };
  return multiply(around, world);
}

const enabled = (obj: SceneObject, kind: Constraint['kind']): Constraint[] =>
  obj.constraints.filter((c) => c.enabled && c.kind === kind);

/**
 * Матрицы мира всех объектов: родители, цепь с задержкой из позы, слежение. `rotations`
 * подменяет собственный поворот костей, решённых IK. Пропавший родитель и цикл — корень.
 */
function resolveAll(
  doc: Document,
  rotations: ReadonlyMap<string, number> | null,
): Map<string, Affine> {
  const byId = new Map(doc.objects.map((o) => [o.id, o]));
  const out = new Map<string, Affine>();
  const visiting = new Set<string>();
  const targetPoint = (id: string | null): Point | null => {
    const target = id === null ? undefined : byId.get(id);
    return target && !visiting.has(target.id) ? pivotOf(target, resolve(target)) : null;
  };
  const resolve = (obj: SceneObject): Affine => {
    const known = out.get(obj.id);
    if (known) return known;
    visiting.add(obj.id);
    const rot = rotations?.get(obj.id);
    const local = transformMatrix(rot === undefined ? obj.transform : { ...obj.transform, rot });
    const parent = obj.parentId === null ? undefined : byId.get(obj.parentId);
    const parentWorld =
      doc.pose?.parents.get(obj.id) ??
      (parent && !visiting.has(parent.id) ? resolve(parent) : null);
    let world = parentWorld ? multiply(parentWorld, local) : local;
    for (const c of enabled(obj, 'aim')) {
      if (c.kind !== 'aim') continue;
      const point =
        doc.pose?.aims.get(aimKey(obj.id, c.id)) ?? targetPoint(c.target ?? obj.parentId);
      if (point) world = aimAt(world, pivotOf(obj, world), point, c.offset);
    }
    visiting.delete(obj.id);
    out.set(obj.id, world);
    return world;
  };
  for (const obj of doc.objects) resolve(obj);
  return out;
}

/** Цепочка костей IK от первой к последней: не длиннее `count` и только из костей. */
function chainOf(tip: SceneObject, count: number, byId: ReadonlyMap<string, SceneObject>) {
  const chain = [tip];
  for (let cur = tip; chain.length < count;) {
    const parent = cur.parentId === null ? undefined : byId.get(cur.parentId);
    if (!parent || parent.rig?.kind !== 'bone' || chain.includes(parent)) break;
    chain.unshift(parent);
    cur = parent;
  }
  return chain;
}

/** Собственные повороты костей, решённых IK, по id. Решение идёт по матрицам без IK. */
function solveIk(doc: Document, base: ReadonlyMap<string, Affine>): Map<string, number> {
  const rotations = new Map<string, number>();
  const byId = new Map(doc.objects.map((o) => [o.id, o]));
  for (const tip of doc.objects) {
    for (const c of enabled(tip, 'ik')) {
      const target = c.kind === 'ik' && c.target !== null ? byId.get(c.target) : undefined;
      if (c.kind !== 'ik' || !target || tip.rig?.kind !== 'bone') continue;
      const chain = chainOf(tip, c.chain, byId);
      if (chain.includes(target)) continue;
      const worlds = chain.map((bone) => base.get(bone.id) as Affine);
      const heads = worlds.map((w) => applyAffine(w, 0, 0));
      const ends = [...heads.slice(1), applyAffine(worlds[worlds.length - 1], tip.rig.length, 0)];
      const angles = worlds.map(angleOf);
      const links: IkLink[] = chain.map((bone, i) => ({
        length: Math.hypot(ends[i].x - heads[i].x, ends[i].y - heads[i].y),
        offset: wrapAngle(
          Math.atan2(ends[i].y - heads[i].y, ends[i].x - heads[i].x) * DEG - angles[i],
        ),
        limit: bone.rig?.kind === 'bone' ? bone.rig.limit : null,
      }));
      const root = chain[0].parentId === null ? undefined : base.get(chain[0].parentId);
      const parentAngle = root ? angleOf(root) : 0;
      const goal = pivotOf(target, base.get(target.id) as Affine);
      const solved = solveFabrik(heads[0], links, angles, parentAngle, goal);
      chain.forEach((bone, i) => {
        const parent = i === 0 ? parentAngle : solved[i - 1];
        rotations.set(bone.id, wrapAngle(solved[i] - parent));
      });
    }
  }
  return rotations;
}

/** Матрицы мира с учётом связей: сначала всё, кроме IK, затем IK поверх — вместе с детьми костей. */
function solveMatrices(doc: Document): ReadonlyMap<string, Affine> {
  const base = resolveAll(doc, null);
  const rotations = solveIk(doc, base);
  return rotations.size > 0 ? resolveAll(doc, rotations) : base;
}

/** Документ неизменяем, поэтому массив объектов вместе с позой — надёжный ключ кэша матриц. */
const plainCache = new WeakMap<readonly object[], ReadonlyMap<string, Affine>>();
const posedCache = new WeakMap<Pose, WeakMap<readonly object[], ReadonlyMap<string, Affine>>>();

/**
 * Матрицы всех объектов из локальных координат в координаты документа: с родителями и связями.
 * Трансформ ребёнка задан относительно родителя; пропавший родитель и цикл считаются корнем —
 * файл недоверенный, и падать на нём нельзя.
 */
export function objectMatrices(doc: Document): ReadonlyMap<string, Affine> {
  let cache = plainCache;
  if (doc.pose) {
    cache = posedCache.get(doc.pose) ?? new WeakMap();
    posedCache.set(doc.pose, cache);
  }
  const cached = cache.get(doc.objects);
  if (cached) return cached;
  const out = solveMatrices(doc);
  cache.set(doc.objects, out);
  return out;
}

/**
 * Входы связей из других моментов: матрица родителя для цепи с задержкой и место цели для
 * слежения. `sceneAt` даёт сцену в другой момент — со своей позой, поэтому звенья цепочки
 * запаздывают одно за другим. undefined — связей из прошлого в сцене нет.
 */
export function temporalPose(
  doc: Document,
  time: number,
  sceneAt: (time: number) => Document,
): Pose | undefined {
  const parents = new Map<string, Affine>();
  const aims = new Map<string, Point>();
  for (const obj of doc.objects) {
    for (const c of obj.constraints) {
      if (!isTemporal(obj, c)) continue;
      if (c.kind === 'follow' && obj.parentId !== null) {
        const past = objectMatrices(sceneAt(time - c.delay)).get(obj.parentId);
        if (past) parents.set(obj.id, past);
      } else if (c.kind === 'aim') {
        const id = c.target ?? obj.parentId;
        const scene = sceneAt(time - c.lag);
        const target = scene.objects.find((o) => o.id === id);
        const world = target && objectMatrices(scene).get(target.id);
        if (target && world) aims.set(aimKey(obj.id, c.id), pivotOf(target, world));
      }
    }
  }
  return parents.size > 0 || aims.size > 0 ? { parents, aims } : undefined;
}

/**
 * Угол, который слежение должно держать, чтобы объект остался как есть: ось X объекта сейчас
 * минус направление на цель. Без цели — родитель; без него — ноль.
 */
export function restAimOffset(doc: Document, objectId: string, targetId: string | null): number {
  const obj = doc.objects.find((o) => o.id === objectId);
  const id = targetId ?? obj?.parentId ?? null;
  const target = id === null ? undefined : doc.objects.find((o) => o.id === id);
  const matrices = objectMatrices(doc);
  const world = obj && matrices.get(obj.id);
  const aim = target && matrices.get(target.id);
  if (!obj || !target || !world || !aim) return 0;
  const from = pivotOf(obj, world);
  const to = pivotOf(target, aim);
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-9) return 0;
  return wrapAngle(angleOf(world) - Math.atan2(to.y - from.y, to.x - from.x) * DEG);
}
