import { mapFrames } from '../../core/animation';
import { type GlyphMaterial, withMaterialPart } from '../../core/material';
import { findObject, updateObject } from '../../core/object';
import { useDocumentStore } from './documentStore';

/**
 * Непрозрачность и оттенок объекта. Анимированное свойство получает ключ в текущий момент —
 * это решает `commitStructural`. `mergeKey` склеивает записи одного перетаскивания.
 */
export function setObjectLookAction(
  id: string,
  patch: { readonly opacity?: number; readonly tint?: string | null },
  label: string,
  mergeKey?: string,
): void {
  const { doc, commitStructural } = useDocumentStore.getState();
  commitStructural(label, updateObject(doc, id, patch), mergeKey);
}

/**
 * Правит GPU-материал объекта: контур или свечение. Материал — свойство объекта, а не рисунок
 * кадра, поэтому правка идёт во все кадры, где объект есть. `mergeKey` склеивает записи
 * одного перетаскивания поля.
 */
export function setMaterialAction(
  objectId: string,
  patch: Partial<GlyphMaterial>,
  label: string,
  mergeKey?: string,
): void {
  const { animation, commitAnimation } = useDocumentStore.getState();
  const next = mapFrames(animation, (doc) => {
    const obj = findObject(doc, objectId);
    if (!obj) return doc;
    return updateObject(doc, objectId, { material: withMaterialPart(obj.material, patch) });
  });
  commitAnimation(label, next, undefined, mergeKey);
}
