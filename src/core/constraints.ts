import type { Affine } from './affine';
import { newId } from './document';
import type { Point } from './geometry';
import type { SceneObject } from './object';

/**
 * Связи (DESIGN.md, раздел 4.4): кинематика без физики. Связь не меняет собственный трансформ
 * объекта — он остаётся таким, как лежит в кадре и ключах, — а меняет, где объект оказывается:
 * результат живёт в матрицах мира. Поэтому правка объекта со связью не запекает позу в кадр.
 */
export type ConstraintKind = 'follow' | 'aim' | 'ik';

interface ConstraintCommon {
  readonly id: string;
  readonly kind: ConstraintKind;
  readonly enabled: boolean;
}

/** Цепь с задержкой: родитель ведёт объект таким, каким был `delay` мс назад. Даёт хлыст и хвост. */
export interface FollowConstraint extends ConstraintCommon {
  readonly kind: 'follow';
  readonly delay: number;
}

/**
 * Слежение: объект поворачивается вслед за направлением на цель — туда, где она была `lag` мс
 * назад. Без цели смотрит на родителя: звенья верёвки разворачиваются вслед за предыдущим.
 */
export interface AimConstraint extends ConstraintCommon {
  readonly kind: 'aim';
  readonly target: string | null;
  readonly lag: number;
  /**
   * Угол оси X объекта относительно направления на цель, градусы. Запоминается, когда связь
   * добавляют или меняют цель: объект не прыгает, а поворачивается, только когда цель уходит.
   */
  readonly offset: number;
}

/** IK: `chain` костей, кончая этой, тянутся концом к цели. Пока цели нет, связь молчит. */
export interface IkConstraint extends ConstraintCommon {
  readonly kind: 'ik';
  readonly target: string | null;
  readonly chain: number;
}

export type Constraint = FollowConstraint | AimConstraint | IkConstraint;

export const MAX_CONSTRAINTS_PER_OBJECT = 4;
export const MAX_DELAY = 10000;
export const MAX_CHAIN = 8;

/**
 * Поза рига: входы связей из других моментов времени. Её кладёт в вычисленную сцену `evaluate`,
 * в файл она не пишется. Остальное — IK и слежение без запаздывания — считается из самой сцены.
 */
export interface Pose {
  /** Матрица мира родителя в прошлом, по объекту с цепью задержки. */
  readonly parents: ReadonlyMap<string, Affine>;
  /** Где была цель слежения, по ключу `aimKey`. */
  readonly aims: ReadonlyMap<string, Point>;
}

/** Ключ входа слежения: id объекта уникален в сцене, id связи — внутри объекта. */
export const aimKey = (objectId: string, constraintId: string): string =>
  `${objectId}/${constraintId}`;

const DEFAULTS: { readonly [K in ConstraintKind]: (id: string) => Constraint } = {
  follow: (id) => ({ id, kind: 'follow', enabled: true, delay: 80 }),
  aim: (id) => ({ id, kind: 'aim', enabled: true, target: null, lag: 0, offset: 0 }),
  ik: (id) => ({ id, kind: 'ik', enabled: true, target: null, chain: 2 }),
};

export function createConstraint(kind: ConstraintKind, id: string = newId('link')): Constraint {
  return DEFAULTS[kind](id);
}

/** Связь берёт вход из прошлого: сцене в этот момент нужна сцена в другой. */
export function isTemporal(obj: SceneObject, c: Constraint): boolean {
  if (!c.enabled) return false;
  if (c.kind === 'follow') return c.delay > 0 && obj.parentId !== null;
  return c.kind === 'aim' && c.lag > 0 && (c.target ?? obj.parentId) !== null;
}
