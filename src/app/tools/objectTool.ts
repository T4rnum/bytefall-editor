import type { Affine } from '../../core/affine';
import type { Document } from '../../core/document';
import type { Point } from '../../core/geometry';
import { moveInDocument } from '../../core/hierarchy';
import { type SceneObject, canEditObject, findObject, transformObject } from '../../core/object';
import { selectionRoots, toggleInSelection } from '../../core/objectSelection';
import { objectAt, objectMatrix } from '../../core/placement';
import { isBone } from '../../core/rig';
import type { Transform2D } from '../../core/transform';
import {
  type ScaleHandle,
  pivotByGesture,
  pivotInDocument,
  rotateByGesture,
  scaleByGesture,
  turnAround,
} from '../../core/transformGesture';
import { gizmoLayout, handleCursor, hitGizmo } from './gizmo';
import { isChained, onBoneTail, rigNodeAt } from './rig';
import type { PointerInfo, Tool, ToolEnv } from './types';

const NUDGE_FAST = 10;
/** Shift при повороте ведёт угол шагами по 15°. */
const ROTATE_SNAP = 15;
/** Узел рига тянется четвертями ячейки, с Shift — свободно. */
const RIG_STEP = 0.25;

/** Жест, который сейчас идёт. Трансформ и матрица — на момент нажатия. */
type Gesture =
  | {
      readonly kind: 'move';
      /** Кого везём: выбранные без потомков выбранных, их и так повезёт предок. */
      readonly ids: readonly string[];
      readonly anchor: Point;
      /** Узел рига едет плавно, по точке указателя, а не по ячейкам. */
      readonly fine: boolean;
      /**
       * Щелчок по объекту из выбранной группы: без переноса выбор на отпускании сужается до него,
       * с переносом группа едет целиком.
       */
      readonly collapseTo: string | null;
      moved: boolean;
    }
  | {
      readonly kind: 'rotate';
      readonly id: string;
      readonly start: Transform2D;
      readonly world: Affine;
      readonly from: Point;
      /** Где указатель был на прошлом шаге и сколько градусов прошёл с начала жеста. */
      last: Point;
      turned: number;
    }
  | {
      readonly kind: 'pivot';
      readonly id: string;
      readonly start: Transform2D;
      readonly world: Affine;
      readonly from: Point;
    }
  | {
      readonly kind: 'scale';
      readonly id: string;
      readonly start: Transform2D;
      readonly world: Affine;
      readonly from: Point;
      readonly handle: ScaleHandle;
    };

const LABELS: Readonly<Record<Gesture['kind'], string>> = {
  move: 'Move object',
  rotate: 'Rotate object',
  scale: 'Scale object',
  pivot: 'Move pivot',
};

/**
 * Жест за гизмо выбранного объекта: ручка под указателем, а с Alt — перенос опоры в любую точку,
 * хоть за пределы объекта: так объект крутят вокруг внешней оси.
 */
function grabHandle(env: ToolEnv, info: PointerInfo): Gesture | null {
  const obj = handleOwner(env);
  if (!obj || !canEditObject(env.doc, obj)) return null;
  const world = objectMatrix(env.doc, obj);
  const base = { id: obj.id, start: obj.transform, world, from: info.point };
  if (obj.rig) {
    // У кости нет рамки и ручек: её поворачивают за конец вокруг сустава, опора — сам сустав.
    const tail = isBone(obj) && onBoneTail(env.doc, obj, info.point, env.zoom);
    return tail ? { kind: 'rotate', ...base, last: info.point, turned: 0 } : null;
  }
  if (info.alt) return { kind: 'pivot', ...base };
  const handle = hitGizmo(gizmoLayout(obj, world, env.zoom), info.point, env.zoom);
  if (!handle) return null;
  return handle.kind === 'scale'
    ? { kind: 'scale', handle: handle.handle, ...base }
    : { kind: 'rotate', ...base, last: info.point, turned: 0 };
}

/** Чьи ручки на холсте: только у единственного выбранного, у группы ручек нет. */
function handleOwner(env: ToolEnv): SceneObject | undefined {
  if (env.selectedObjectIds.length > 1 || !env.selectedObjectId) return undefined;
  return findObject(env.doc, env.selectedObjectId);
}

/**
 * Жест от нажатия на объект: кость в цепочке поворачивается вокруг сустава, остальное едет. Объект
 * из выбранной группы везёт с собой всю группу.
 */
function pressGesture(env: ToolEnv, hit: SceneObject, info: PointerInfo, group: boolean): Gesture {
  if (!group && isChained(env.doc, hit)) {
    const world = objectMatrix(env.doc, hit);
    const base = { id: hit.id, start: hit.transform, world, from: info.point };
    return { kind: 'rotate', ...base, last: info.point, turned: 0 };
  }
  const fine = hit.rig !== null;
  const ids = group ? movableRoots(env) : [hit.id];
  const anchor = fine ? info.point : info.cell;
  return { kind: 'move', ids, anchor, fine, collapseTo: group ? hit.id : null, moved: false };
}

/** Выбранные, которые можно двигать: без запертых и без потомков выбранных. */
function movableRoots(env: ToolEnv): string[] {
  return selectionRoots(env.doc, env.selectedObjectIds).filter((id) => {
    const obj = findObject(env.doc, id);
    return obj !== undefined && canEditObject(env.doc, obj);
  });
}

/** Каждый объект из `ids` на (dx, dy): одна правка документа на всю группу. */
function moveAll(doc: Document, ids: readonly string[], dx: number, dy: number): Document {
  return ids.reduce((next, id) => moveInDocument(next, id, dx, dy), doc);
}

/** Документ, каким он станет, если отпустить кнопку здесь. null — ничего не изменилось. */
function gestureResult(env: ToolEnv, g: Gesture, info: PointerInfo): Document | null {
  switch (g.kind) {
    case 'move': {
      const at = g.fine ? info.point : info.cell;
      const snap = (v: number): number =>
        g.fine && !info.shift ? Math.round(v / RIG_STEP) * RIG_STEP : v;
      const dx = snap(at.x - g.anchor.x);
      const dy = snap(at.y - g.anchor.y);
      if (dx === 0 && dy === 0 && !g.moved) return null;
      g.moved = true;
      return moveAll(env.doc, g.ids, dx, dy);
    }
    case 'rotate': {
      // Угол копится по шагам: так жест проходит и полный оборот, и несколько.
      g.turned += turnAround(pivotInDocument(g.start, g.world), g.last, info.point);
      g.last = info.point;
      const rot = rotateByGesture(g.start, g.turned, info.shift ? ROTATE_SNAP : null);
      return transformObject(env.doc, g.id, { rot });
    }
    case 'scale':
      return transformObject(
        env.doc,
        g.id,
        scaleByGesture(g.start, g.world, g.handle, g.from, info.point, info.shift),
      );
    case 'pivot':
      return transformObject(env.doc, g.id, pivotByGesture(g.start, g.world, info.point));
  }
}

/**
 * Выбор, перенос и трансформ объектов. Клик выбирает верхний объект под курсором, клик по
 * пустому месту снимает выбор. У выбранного объекта гизмо: угловые и боковые ручки масштабируют
 * (с Shift — пропорционально), кружок над рамкой поворачивает (с Shift — шагами по 15°).
 * Alt с нажатием ставит опору — точку, вокруг которой идут поворот и масштаб, — под указатель.
 * Всё показывается черновиком документа и коммитится на отпускании.
 */
export function createObjectTool(): Tool {
  let gesture: Gesture | null = null;

  const stop = (env: ToolEnv): void => {
    gesture = null;
    env.setDraft(null);
  };

  return {
    id: 'object',
    label: 'Объект',
    hotkey: 'v',
    cursor: 'default',
    // Alt здесь переносит опору: объектам пипетка не нужна, у неё есть свой инструмент.
    ownsAlt: true,
    onPointerDown(env, info) {
      if (info.button !== 0) return;
      gesture = grabHandle(env, info);
      if (gesture) {
        // Опора прыгает под указатель сразу, не дожидаясь движения.
        const next = gesture.kind === 'pivot' ? gestureResult(env, gesture, info) : null;
        if (next) env.setDraft(next);
        return;
      }
      // Кость и контроллер тоньше ячейки и лежат поверх рисунка: их ищем первыми.
      const hit =
        rigNodeAt(env.doc, info.point, env.zoom) ?? objectAt(env.doc, info.cell.x, info.cell.y);
      if (info.ctrl || info.shift) {
        // Ctrl или Shift по объекту добавляет его к выбору или убирает из него, ничего не двигая.
        if (hit) env.setSelectedObjects(toggleInSelection(env.selectedObjectIds, hit.id));
        return;
      }
      const group =
        hit !== undefined &&
        env.selectedObjectIds.length > 1 &&
        env.selectedObjectIds.includes(hit.id);
      if (!group) env.setSelectedObject(hit ? hit.id : null);
      if (hit && canEditObject(env.doc, hit)) gesture = pressGesture(env, hit, info, group);
    },
    onPointerMove(env, info) {
      if (!gesture) return;
      const next = gestureResult(env, gesture, info);
      if (next) env.setDraft(next);
    },
    onPointerUp(env, info) {
      if (!gesture) return;
      const finished = gesture;
      const next = gestureResult(env, finished, info);
      stop(env);
      if (next && next !== env.doc) env.commitDocument(LABELS[finished.kind], next);
      else if (finished.kind === 'move' && finished.collapseTo) {
        env.setSelectedObject(finished.collapseTo);
      }
    },
    hoverCursor(env, info) {
      const obj = handleOwner(env);
      if (obj && canEditObject(env.doc, obj) && obj.rig) {
        if (isBone(obj) && onBoneTail(env.doc, obj, info.point, env.zoom)) return 'grab';
      } else if (obj && canEditObject(env.doc, obj)) {
        if (info.alt) return 'crosshair';
        const layout = gizmoLayout(obj, objectMatrix(env.doc, obj), env.zoom);
        const handle = hitGizmo(layout, info.point, env.zoom);
        if (handle) return handleCursor(layout, handle);
      }
      const hit =
        rigNodeAt(env.doc, info.point, env.zoom) ?? objectAt(env.doc, info.cell.x, info.cell.y);
      if (!hit) return null;
      return isChained(env.doc, hit) ? 'grab' : 'move';
    },
    onKeyDown(env, event) {
      if (env.selectedObjectIds.length === 0 || event.ctrlKey || event.metaKey || event.altKey) {
        return false;
      }
      const step = event.shiftKey ? NUDGE_FAST : 1;
      const nudge = (dx: number, dy: number): boolean => {
        const ids = movableRoots(env);
        if (ids.length > 0) env.commitDocument('Nudge object', moveAll(env.doc, ids, dx, dy));
        return true;
      };
      switch (event.key) {
        case 'ArrowLeft':
          return nudge(-step, 0);
        case 'ArrowRight':
          return nudge(step, 0);
        case 'ArrowUp':
          return nudge(0, -step);
        case 'ArrowDown':
          return nudge(0, step);
        case 'Escape':
          // Отмена жеста: объект остаётся выбранным, черновик сбрасывается.
          if (gesture) stop(env);
          else env.setSelectedObject(null);
          return true;
        default:
          return false;
      }
    },
    cancel(env) {
      stop(env);
    },
  };
}
