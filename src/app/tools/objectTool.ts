import type { Affine } from '../../core/affine';
import type { Document } from '../../core/document';
import type { Point } from '../../core/geometry';
import { moveInDocument, removeObject } from '../../core/hierarchy';
import { canEditObject, findObject, transformObject } from '../../core/object';
import { objectAt, objectMatrix } from '../../core/placement';
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
import type { PointerInfo, Tool, ToolEnv } from './types';

const NUDGE_FAST = 10;
/** Shift при повороте ведёт угол шагами по 15°. */
const ROTATE_SNAP = 15;

/** Жест, который сейчас идёт. Трансформ и матрица — на момент нажатия. */
type Gesture =
  | { readonly kind: 'move'; readonly id: string; readonly anchor: Point; moved: boolean }
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
  const obj = env.selectedObjectId ? findObject(env.doc, env.selectedObjectId) : undefined;
  if (!obj || !canEditObject(env.doc, obj)) return null;
  const world = objectMatrix(env.doc, obj);
  const base = { id: obj.id, start: obj.transform, world, from: info.point };
  if (info.alt) return { kind: 'pivot', ...base };
  const handle = hitGizmo(gizmoLayout(obj, world, env.zoom), info.point, env.zoom);
  if (!handle) return null;
  return handle.kind === 'scale'
    ? { kind: 'scale', handle: handle.handle, ...base }
    : { kind: 'rotate', ...base, last: info.point, turned: 0 };
}

/** Документ, каким он станет, если отпустить кнопку здесь. null — ничего не изменилось. */
function gestureResult(env: ToolEnv, g: Gesture, info: PointerInfo): Document | null {
  switch (g.kind) {
    case 'move': {
      const dx = info.cell.x - g.anchor.x;
      const dy = info.cell.y - g.anchor.y;
      if (dx === 0 && dy === 0 && !g.moved) return null;
      g.moved = true;
      return moveInDocument(env.doc, g.id, dx, dy);
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
      const hit = objectAt(env.doc, info.cell.x, info.cell.y);
      env.setSelectedObject(hit ? hit.id : null);
      if (hit && canEditObject(env.doc, hit)) {
        gesture = { kind: 'move', id: hit.id, anchor: info.cell, moved: false };
      }
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
    },
    hoverCursor(env, info) {
      const obj = env.selectedObjectId ? findObject(env.doc, env.selectedObjectId) : undefined;
      if (obj && canEditObject(env.doc, obj)) {
        if (info.alt) return 'crosshair';
        const layout = gizmoLayout(obj, objectMatrix(env.doc, obj), env.zoom);
        const handle = hitGizmo(layout, info.point, env.zoom);
        if (handle) return handleCursor(layout, handle);
      }
      return objectAt(env.doc, info.cell.x, info.cell.y) ? 'move' : null;
    },
    onKeyDown(env, event) {
      const id = env.selectedObjectId;
      if (!id || event.ctrlKey || event.metaKey || event.altKey) return false;
      const obj = findObject(env.doc, id);
      if (!obj) return false;
      const step = event.shiftKey ? NUDGE_FAST : 1;
      const nudge = (dx: number, dy: number): boolean => {
        if (canEditObject(env.doc, obj)) {
          env.commitDocument('Nudge object', moveInDocument(env.doc, id, dx, dy));
        }
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
        case 'Delete':
        case 'Backspace':
          if (canEditObject(env.doc, obj)) {
            env.commitDocument('Delete object', removeObject(env.doc, id));
            env.setSelectedObject(null);
          }
          return true;
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
