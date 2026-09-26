import { type Affine, applyAffine } from './affine';
import { type Constraint, MAX_CONSTRAINTS_PER_OBJECT, createConstraint } from './constraints';
import { type Document, MAX_DIMENSION } from './document';
import type { Point } from './geometry';
import { removeObject, setParent } from './hierarchy';
import { type SceneObject, addObject, createObject, findObject, updateObject } from './object';
import { objectMatrices } from './placement';
import { type Transform2D, normalizeTransform } from './transform';

/**
 * Риг (DESIGN.md, раздел 4.4): кости и контроллеры — объекты без символов. Так у них сразу есть
 * иерархия, трансформ, ключи, гизмо и строка в панели объектов, и риг не заводит второй мир
 * рядом с объектами. Видны они только в редакторе: в картинку и текст не попадают.
 */

/** Пределы поворота сустава относительно родителя, градусы: их держит IK. */
export interface AngleLimit {
  readonly min: number;
  readonly max: number;
}

/** Кость: отрезок от начала объекта вдоль его оси X. Поворот идёт вокруг начала — сустава. */
export interface BoneRig {
  readonly kind: 'bone';
  readonly length: number;
  readonly limit: AngleLimit | null;
}

/** Контроллер: точка, за которую тянут, — цель IK и ручка для аниматора. */
export interface ControlRig {
  readonly kind: 'control';
}

export type Rig = BoneRig | ControlRig;

export const MIN_BONE_LENGTH = 0.25;
export const MAX_BONE_LENGTH = MAX_DIMENSION;
export const MAX_LIMIT = 180;

export type Bone = SceneObject & { readonly rig: BoneRig };

export const isBone = (obj: SceneObject): obj is Bone => obj.rig?.kind === 'bone';

/** Начало и конец кости в координатах документа. */
export function boneEnds(world: Affine, bone: BoneRig): { head: Point; tail: Point } {
  return { head: applyAffine(world, 0, 0), tail: applyAffine(world, bone.length, 0) };
}

/** Точка документа в трансформ объекта без родителя: целая часть в ячейку, дробная в сдвиг. */
function placeAt(at: Point, rot = 0): Transform2D {
  const x = Math.round(at.x);
  const y = Math.round(at.y);
  return normalizeTransform({ x, y, dx: at.x - x, dy: at.y - y, rot, sx: 1, sy: 1, px: 0, py: 0 });
}

export const clampLength = (length: number): number =>
  Math.min(MAX_BONE_LENGTH, Math.max(MIN_BONE_LENGTH, Math.round(length * 1e6) / 1e6));

/** Пределы по порядку и в допустимом диапазоне. */
export function normalizeLimit(limit: AngleLimit): AngleLimit {
  const clamp = (v: number): number => Math.min(MAX_LIMIT, Math.max(-MAX_LIMIT, v));
  const a = clamp(limit.min);
  const b = clamp(limit.max);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

interface NodeInit {
  readonly name: string;
  readonly layerId: string;
  readonly id?: string;
}

/** Кость от `head` к `tail` в координатах документа, пока без родителя. */
export function createBone(init: NodeInit & { readonly head: Point; readonly tail: Point }): Bone {
  const { head, tail } = init;
  const rot = (Math.atan2(tail.y - head.y, tail.x - head.x) * 180) / Math.PI;
  const length = clampLength(Math.hypot(tail.x - head.x, tail.y - head.y));
  const base = createObject({ name: init.name, layerId: init.layerId, x: 0, y: 0, id: init.id });
  return { ...base, transform: placeAt(head, rot), rig: { kind: 'bone', length, limit: null } };
}

/** Контроллер в точке документа, пока без родителя. */
export function createControl(init: NodeInit & { readonly at: Point }): SceneObject {
  const base = createObject({ name: init.name, layerId: init.layerId, x: 0, y: 0, id: init.id });
  return { ...base, transform: placeAt(init.at), rig: { kind: 'control' } };
}

/**
 * Добавляет узел рига и сразу отдаёт его родителю, не сдвигая: узел задан в координатах
 * документа, а трансформ под родителем пересчитывается так, чтобы он остался на месте.
 */
export function addRigNode(doc: Document, node: SceneObject, parentId: string | null): Document {
  const added = addObject(doc, node);
  return parentId === null ? added : setParent(added, node.id, parentId);
}

/**
 * Новая длина кости. Дочерние кости, которые начинались на её конце, едут вместе с концом: так
 * цепочка остаётся цепочкой, как у соединённых костей в Blender.
 */
export function setBoneLength(doc: Document, id: string, length: number): Document {
  const bone = findObject(doc, id);
  if (!bone || !isBone(bone)) return doc;
  const next = clampLength(length);
  const was = bone.rig.length;
  if (next === was) return doc;
  let out = updateObject(doc, id, { rig: { ...bone.rig, length: next } });
  for (const child of doc.objects) {
    const t = child.transform;
    const onTail = Math.abs(t.x + t.dx - was) < 1e-6 && Math.abs(t.y + t.dy) < 1e-6;
    if (child.parentId !== id || !onTail) continue;
    const x = Math.round(next);
    out = updateObject(out, child.id, {
      transform: normalizeTransform({ ...t, x, dx: next - x, y: 0, dy: 0 }),
    });
  }
  return out;
}

/** Сколько костей IK берёт по умолчанию: плечо и предплечье, бедро и голень. */
const DEFAULT_CHAIN = 2;

/**
 * IK к новому контроллеру: контроллер встаёт на конец кости, кость получает IK к нему. Цепочка —
 * до двух костей вверх, пока родитель — кость. Контроллер становится ребёнком того, к чему
 * крепится цепочка, — тела персонажа: тело едет, и цель едет с ним. Прежний IK кости заменяется.
 */
export function addIkControl(
  doc: Document,
  boneId: string,
): { readonly doc: Document; readonly controlId: string } | null {
  const bone = findObject(doc, boneId);
  if (!bone || !isBone(bone)) return null;
  const others = bone.constraints.filter((c) => c.kind !== 'ik');
  if (others.length >= MAX_CONSTRAINTS_PER_OBJECT) return null;
  let root: SceneObject = bone;
  let chain = 1;
  for (let up = root.parentId; up !== null && chain < DEFAULT_CHAIN; chain++) {
    const parent = findObject(doc, up);
    if (!parent || !isBone(parent)) break;
    root = parent;
    up = parent.parentId;
  }
  const tail = boneEnds(objectMatrices(doc).get(bone.id) as Affine, bone.rig).tail;
  const control = createControl({ name: `Цель: ${bone.name}`, layerId: bone.layerId, at: tail });
  const ik: Constraint = { ...createConstraint('ik'), target: control.id, chain } as Constraint;
  const withControl = addRigNode(doc, control, root.parentId);
  return {
    doc: updateObject(withControl, bone.id, { constraints: [...others, ik] }),
    controlId: control.id,
  };
}

/**
 * Убирает связь объекта. Контроллер, к которому она тянулась, уходит вместе с ней, если на него
 * не смотрит больше ни одна связь и детей у него нет: без связи контроллер — точка, которая
 * ничего не двигает. Обычный объект-цель остаётся: он и сам по себе рисунок.
 */
export function removeConstraint(doc: Document, objectId: string, linkId: string): Document {
  const obj = findObject(doc, objectId);
  const link = obj?.constraints.find((c) => c.id === linkId);
  if (!obj || !link) return doc;
  const constraints = obj.constraints.filter((c) => c !== link);
  const next = updateObject(doc, objectId, { constraints });
  const targetId = link.kind === 'follow' ? null : link.target;
  const target = targetId === null ? undefined : findObject(next, targetId);
  if (!target || target.rig?.kind !== 'control') return next;
  const used = next.objects.some(
    (o) =>
      o.parentId === target.id ||
      o.constraints.some((c) => c.kind !== 'follow' && c.target === target.id),
  );
  return used ? next : removeObject(next, target.id);
}
