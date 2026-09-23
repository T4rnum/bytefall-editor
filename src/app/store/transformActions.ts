import type { Point } from '../../core/geometry';
import { findObject, transformObject } from '../../core/object';
import { type Transform2D, withPivot } from '../../core/transform';
import { normalizeAngle } from '../../core/transformGesture';
import { useDocumentStore } from './documentStore';
import { editGlyphsAction, selectedGlyphs } from './glyphActions';
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

/**
 * Доворачивает на `delta` градусов по часовой стрелке то, что выбрано: выделенные символы
 * объекта, каждый вокруг своего центра, а если их нет — объект целиком.
 */
export function rotateSelectedAction(delta: number): void {
  const glyphs = selectedGlyphs();
  if (glyphs) {
    editGlyphsAction(
      glyphs,
      (c) => ({ ...c, rot: normalizeAngle(c.rot + delta) }),
      'Rotate glyphs',
    );
    return;
  }
  const obj = editableSelectedObject();
  if (obj)
    transformObjectAction(
      obj.id,
      { rot: normalizeAngle(obj.transform.rot + delta) },
      'Rotate object',
    );
}

/** Снимает поворот с выделенных символов или с объекта, как Alt+R в Blender. */
export function resetSelectedRotationAction(): void {
  const glyphs = selectedGlyphs();
  if (glyphs) {
    editGlyphsAction(glyphs, (c) => ({ ...c, rot: 0 }), 'Reset glyph rotation');
    return;
  }
  const obj = editableSelectedObject();
  if (obj) transformObjectAction(obj.id, { rot: 0 }, 'Reset rotation');
}

/** Возвращает масштаб 1:1 выделенным символам или объекту, как Alt+S в Blender. */
export function resetSelectedScaleAction(): void {
  const glyphs = selectedGlyphs();
  if (glyphs) {
    editGlyphsAction(glyphs, (c) => ({ ...c, sx: 1, sy: 1 }), 'Reset glyph scale');
    return;
  }
  const obj = editableSelectedObject();
  if (obj) transformObjectAction(obj.id, { sx: 1, sy: 1 }, 'Reset scale');
}

/** Снимает с объекта всё, кроме положения и опоры: поворот, масштаб и дробное смещение. */
export function resetObjectLookAction(id: string): void {
  transformObjectAction(id, { rot: 0, sx: 1, sy: 1, dx: 0, dy: 0 }, 'Reset transform');
}
