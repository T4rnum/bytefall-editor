import type { Point } from '../../core/geometry';
import { findObject, transformObject } from '../../core/object';
import { type Transform2D, withPivot } from '../../core/transform';
import { normalizeAngle } from '../../core/transformGesture';
import { useDocumentStore } from './documentStore';
import { editableSelectedObject } from './objectActions';

const docState = () => useDocumentStore.getState();

/**
 * Меняет поля трансформа объекта. `mergeKey` склеивает записи одного жеста: поле инспектора
 * пишет на каждое движение, а отменяется жест целиком.
 */
export function transformObjectAction(
  id: string,
  patch: Partial<Transform2D>,
  label: string,
  mergeKey?: string,
): void {
  const { doc, commitStructural } = docState();
  commitStructural(label, transformObject(doc, id, patch), mergeKey);
}

/** Переносит опорную точку, не сдвигая объект на экране. */
export function setObjectPivotAction(id: string, pivot: Point, mergeKey?: string): void {
  const { doc, commitStructural } = docState();
  const obj = findObject(doc, id);
  if (!obj) return;
  commitStructural(
    'Move pivot',
    transformObject(doc, id, withPivot(obj.transform, pivot)),
    mergeKey,
  );
}

/** Доворачивает выбранный объект на `delta` градусов по часовой стрелке. */
export function rotateSelectedObjectAction(delta: number): void {
  const obj = editableSelectedObject();
  if (!obj) return;
  const rot = normalizeAngle(obj.transform.rot + delta);
  transformObjectAction(obj.id, { rot }, 'Rotate object');
}

/** Снимает поворот, как Alt+R в Blender: положение и масштаб остаются. */
export function resetSelectedRotationAction(): void {
  const obj = editableSelectedObject();
  if (obj) transformObjectAction(obj.id, { rot: 0 }, 'Reset rotation');
}

/** Возвращает масштаб 1:1, как Alt+S в Blender. */
export function resetSelectedScaleAction(): void {
  const obj = editableSelectedObject();
  if (obj) transformObjectAction(obj.id, { sx: 1, sy: 1 }, 'Reset scale');
}

/** Снимает с объекта всё, кроме положения и опоры: поворот, масштаб и дробное смещение. */
export function resetObjectLookAction(id: string): void {
  transformObjectAction(id, { rot: 0, sx: 1, sy: 1, dx: 0, dy: 0 }, 'Reset transform');
}
