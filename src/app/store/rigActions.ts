import { mapFrames } from '../../core/animation';
import { findObject, updateObject } from '../../core/object';
import { type AngleLimit, isBone, normalizeLimit, setBoneLength } from '../../core/rig';
import { useDocumentStore } from './documentStore';

/*
 * Кость — часть рига, а не рисунок кадра: её длина и пределы одни во всех кадрах, где она есть.
 * Иначе персонаж менял бы скелет при смене кадра. То же правило у деформеров.
 */

export function setBoneLengthAction(id: string, length: number, mergeKey?: string): void {
  const { animation, commitAnimation } = useDocumentStore.getState();
  const next = mapFrames(animation, (doc) => setBoneLength(doc, id, length));
  if (next !== animation) commitAnimation('Bone length', next, undefined, mergeKey);
}

/** Пределы угла сустава для IK; null снимает их. */
export function setBoneLimitAction(id: string, limit: AngleLimit | null, mergeKey?: string): void {
  const { animation, commitAnimation } = useDocumentStore.getState();
  const value = limit ? normalizeLimit(limit) : null;
  const next = mapFrames(animation, (doc) => {
    const bone = findObject(doc, id);
    return bone && isBone(bone)
      ? updateObject(doc, id, { rig: { ...bone.rig, limit: value } })
      : doc;
  });
  commitAnimation('Bone limit', next, undefined, mergeKey);
}
