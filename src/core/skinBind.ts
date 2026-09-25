import { type Affine, invertAffine, multiply } from './affine';
import type { Document } from './document';
import { descendantIds } from './hierarchy';
import { findObject } from './object';
import { objectMatrices } from './placement';
import { isBone } from './rig';
import { MAX_SKIN_BONES, type SkinBone } from './skin';

/**
 * Поза покоя для скиннинга: кости объекта — его потомки — такими, какими они видны сейчас,
 * в координатах объекта. От этой позы символы и отсчитывают, куда их унесла кость. Отдельно от
 * `skin.ts`: деформер не должен тянуть за собой иерархию и матрицы сцены.
 */
export function bindSkin(doc: Document, objectId: string): SkinBone[] {
  const obj = findObject(doc, objectId);
  const matrices = objectMatrices(doc);
  const world = obj && matrices.get(obj.id);
  const inverse = world && invertAffine(world);
  if (!inverse) return [];
  const below = descendantIds(doc, objectId);
  return doc.objects
    .filter(isBone)
    .filter((bone) => below.has(bone.id))
    .slice(0, MAX_SKIN_BONES)
    .map((bone) => ({
      id: bone.id,
      bind: multiply(inverse, matrices.get(bone.id) as Affine),
      length: bone.rig.length,
    }));
}
