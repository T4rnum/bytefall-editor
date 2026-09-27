import { cellAspect } from '../../core/font/font';
import type { Point } from '../../core/geometry';
import { findObject, transformObject } from '../../core/object';
import { type Transform2D, withPivot } from '../../core/transform';
import { normalizeAngle } from '../../core/transformGesture';
import { useDocumentStore } from './documentStore';
import { editGlyphsAction, selectedGlyphs } from './glyphActions';
import { editableSelectedObjects } from './objectBatchActions';

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
    transformObject(doc, id, withPivot(obj.transform, pivot, cellAspect(doc.font))),
    mergeKey,
  );
}

/**
 * Доворачивает на `delta` градусов по часовой стрелке то, что выбрано: выделенные символы
 * объекта, каждый вокруг своего центра, а если их нет — выбранные объекты, каждый вокруг своей
 * опоры.
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
  // Угол объекта не сворачивается в полуоборот: ключ анимации повёл бы его назад по кругу.
  transformSelected((t) => ({ rot: t.rot + delta }), 'Rotate object', 'Rotate objects');
}

/** Снимает поворот с выделенных символов или с выбранных объектов, как Alt+R в Blender. */
export function resetSelectedRotationAction(): void {
  const glyphs = selectedGlyphs();
  if (glyphs) {
    editGlyphsAction(glyphs, (c) => ({ ...c, rot: 0 }), 'Reset glyph rotation');
    return;
  }
  transformSelected(() => ({ rot: 0 }), 'Reset rotation', 'Reset rotations');
}

/** Возвращает масштаб 1:1 выделенным символам или выбранным объектам, как Alt+S в Blender. */
export function resetSelectedScaleAction(): void {
  const glyphs = selectedGlyphs();
  if (glyphs) {
    editGlyphsAction(glyphs, (c) => ({ ...c, sx: 1, sy: 1 }), 'Reset glyph scale');
    return;
  }
  transformSelected(() => ({ sx: 1, sy: 1 }), 'Reset scale', 'Reset scales');
}

/** Правка трансформа каждого выбранного объекта от его собственного, одной записью. */
function transformSelected(
  patch: (t: Transform2D) => Partial<Transform2D>,
  one: string,
  many: string,
): void {
  const objects = editableSelectedObjects();
  if (objects.length === 0) return;
  let doc = docState().doc;
  for (const obj of objects) doc = transformObject(doc, obj.id, patch(obj.transform));
  docState().commitStructural(objects.length > 1 ? many : one, doc);
}

/** Снимает с объекта всё, кроме положения и опоры: поворот, масштаб и дробное смещение. */
export function resetObjectLookAction(id: string): void {
  transformObjectAction(id, { rot: 0, sx: 1, sy: 1, dx: 0, dy: 0 }, 'Reset transform');
}
