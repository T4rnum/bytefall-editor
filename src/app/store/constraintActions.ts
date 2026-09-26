import { mapFrames } from '../../core/animation';
import {
  type Constraint,
  type ConstraintKind,
  MAX_CONSTRAINTS_PER_OBJECT,
  createConstraint,
} from '../../core/constraints';
import { findObject, updateObject } from '../../core/object';
import { restAimOffset } from '../../core/pose';
import { addIkControl, isBone, removeConstraint } from '../../core/rig';
import { plural } from '../ui/plural';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { notify } from './notifyStore';

type Links = readonly Constraint[];

/**
 * Связи — часть рига, а не рисунок кадра: правка идёт во все кадры, где объект есть. Правка
 * нескольких объектов — одна запись истории.
 */
function editLinks(
  objectIds: readonly string[],
  label: string,
  fn: (links: Links, objectId: string) => Links,
  mergeKey?: string,
) {
  const { animation, commitAnimation } = useDocumentStore.getState();
  const next = mapFrames(animation, (doc) => {
    let out = doc;
    for (const objectId of objectIds) {
      const obj = findObject(out, objectId);
      if (!obj) continue;
      const constraints = fn(obj.constraints, objectId);
      if (constraints !== obj.constraints) out = updateObject(out, objectId, { constraints });
    }
    return out;
  });
  if (next !== animation) commitAnimation(label, next, undefined, mergeKey);
}

function hasRoom(links: Links): boolean {
  if (links.length < MAX_CONSTRAINTS_PER_OBJECT) return true;
  const limit = plural(MAX_CONSTRAINTS_PER_OBJECT, { one: 'связи', few: 'связей', many: 'связей' });
  notify(`Не больше ${limit} на объект`, 'error');
  return false;
}

/**
 * Даёт связь каждому объекту из `objectIds`, у каждого — своя. Так верёвка собирается одной
 * командой: выбрать звенья цепочки и дать всем задержку за родителем.
 */
export function addConstraintAction(objectIds: readonly string[], kind: ConstraintKind): void {
  const { doc } = useDocumentStore.getState();
  const targets = objectIds.filter((id) => {
    const obj = findObject(doc, id);
    return obj !== undefined && hasRoom(obj.constraints);
  });
  if (targets.length === 0) return;
  const links = new Map(
    targets.map((id) => {
      const created = createConstraint(kind);
      // Слежение запоминает, как объект стоит сейчас: иначе он развернулся бы осью X к родителю.
      const link =
        created.kind === 'aim' ? { ...created, offset: restAimOffset(doc, id, null) } : created;
      return [id, link];
    }),
  );
  editLinks(targets, 'Add constraint', (current, id) => [...current, links.get(id) as Constraint]);
}

/** Связь уходит во всех кадрах, а с ней — её контроллер, если он больше никому не нужен. */
export function removeConstraintAction(objectId: string, id: string): void {
  const { animation, commitAnimation } = useDocumentStore.getState();
  const next = mapFrames(animation, (doc) => removeConstraint(doc, objectId, id));
  if (next !== animation) commitAnimation('Remove constraint', next);
}

export function updateConstraintAction(
  objectId: string,
  id: string,
  patch: Readonly<Record<string, unknown>>,
  mergeKey?: string,
): void {
  editLinks(
    [objectId],
    'Constraint settings',
    (links) => links.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    mergeKey,
  );
}

/** Новая цель связи. Слежение заново запоминает угол, чтобы объект не прыгнул к новой цели. */
export function setLinkTargetAction(objectId: string, id: string, target: string | null): void {
  const { doc } = useDocumentStore.getState();
  const link = findObject(doc, objectId)?.constraints.find((c) => c.id === id);
  if (!link || link.kind === 'follow') return;
  const offset = link.kind === 'aim' ? { offset: restAimOffset(doc, objectId, target) } : {};
  updateConstraintAction(objectId, id, { target, ...offset });
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
