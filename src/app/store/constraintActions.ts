import { mapFrames } from '../../core/animation';
import {
  type Constraint,
  type ConstraintKind,
  MAX_CONSTRAINTS_PER_OBJECT,
  createConstraint,
} from '../../core/constraints';
import { findObject, updateObject } from '../../core/object';
import { addIkControl, isBone } from '../../core/rig';
import { plural } from '../ui/plural';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { notify } from './notifyStore';

type Links = readonly Constraint[];

/** Связи — часть рига, а не рисунок кадра: правка идёт во все кадры, где объект есть. */
function editLinks(
  objectId: string,
  label: string,
  fn: (links: Links) => Links,
  mergeKey?: string,
) {
  const { animation, commitAnimation } = useDocumentStore.getState();
  const next = mapFrames(animation, (doc) => {
    const obj = findObject(doc, objectId);
    if (!obj) return doc;
    const constraints = fn(obj.constraints);
    return constraints === obj.constraints ? doc : updateObject(doc, objectId, { constraints });
  });
  if (next !== animation) commitAnimation(label, next, undefined, mergeKey);
}

function hasRoom(links: Links): boolean {
  if (links.length < MAX_CONSTRAINTS_PER_OBJECT) return true;
  const limit = plural(MAX_CONSTRAINTS_PER_OBJECT, { one: 'связи', few: 'связей', many: 'связей' });
  notify(`Не больше ${limit} на объект`, 'error');
  return false;
}

export function addConstraintAction(objectId: string, kind: ConstraintKind): void {
  const obj = findObject(useDocumentStore.getState().doc, objectId);
  if (!obj || !hasRoom(obj.constraints)) return;
  const link = createConstraint(kind);
  editLinks(objectId, 'Add constraint', (links) => [...links, link]);
}

export function removeConstraintAction(objectId: string, id: string): void {
  editLinks(objectId, 'Remove constraint', (links) => links.filter((c) => c.id !== id));
}

export function updateConstraintAction(
  objectId: string,
  id: string,
  patch: Readonly<Record<string, unknown>>,
  mergeKey?: string,
): void {
  editLinks(
    objectId,
    'Constraint settings',
    (links) => links.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    mergeKey,
  );
}

/**
 * Shift+I: у выбранной кости появляется контроллер на конце и IK к нему. Выбирается контроллер —
 * его сразу можно тянуть.
 */
export function addIkControlAction(): void {
  const { doc, commitStructural } = useDocumentStore.getState();
  const editor = useEditorStore.getState();
  const bone = editor.selectedObjectId ? findObject(doc, editor.selectedObjectId) : undefined;
  if (!bone || !isBone(bone)) {
    notify('Выбери кость: IK встаёт на конец цепочки', 'error');
    return;
  }
  const added = addIkControl(doc, bone.id);
  if (!added) {
    hasRoom(bone.constraints);
    return;
  }
  commitStructural('Add IK control', added.doc);
  editor.setTool('object');
  editor.setSelectedObject(added.controlId);
}
