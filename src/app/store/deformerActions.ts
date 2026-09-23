import { mapFrames } from '../../core/animation';
import {
  type Deformer,
  type DeformerKind,
  MAX_DEFORMERS_PER_OBJECT,
  createDeformer,
} from '../../core/deformers';
import { findObject, updateObject } from '../../core/object';
import { plural } from '../ui/plural';
import { useDocumentStore } from './documentStore';
import { notify } from './notifyStore';

/**
 * Деформеры — модификаторы объекта, а не рисунок кадра: правка стека идёт во все кадры, где
 * объект есть, иначе волна пропадала бы при смене кадра.
 */
function editStack(
  objectId: string,
  label: string,
  fn: (stack: readonly Deformer[]) => readonly Deformer[],
  mergeKey?: string,
): void {
  const { animation, commitAnimation } = useDocumentStore.getState();
  const next = mapFrames(animation, (doc) => {
    const obj = findObject(doc, objectId);
    if (!obj) return doc;
    const deformers = fn(obj.deformers);
    return deformers === obj.deformers ? doc : updateObject(doc, objectId, { deformers });
  });
  commitAnimation(label, next, undefined, mergeKey);
}

export function addDeformerAction(objectId: string, kind: DeformerKind): void {
  const obj = findObject(useDocumentStore.getState().doc, objectId);
  if (!obj) return;
  if (obj.deformers.length >= MAX_DEFORMERS_PER_OBJECT) {
    const limit = plural(MAX_DEFORMERS_PER_OBJECT, {
      one: 'деформера',
      few: 'деформеров',
      many: 'деформеров',
    });
    notify(`Не больше ${limit} на объект`, 'error');
    return;
  }
  const deformer = createDeformer(kind);
  editStack(objectId, 'Add deformer', (stack) => [...stack, deformer]);
}

export function removeDeformerAction(objectId: string, deformerId: string): void {
  editStack(objectId, 'Remove deformer', (stack) => stack.filter((d) => d.id !== deformerId));
}

/** Сдвигает деформер по стеку: порядок меняет результат, как у модификаторов Blender. */
export function moveDeformerAction(objectId: string, deformerId: string, delta: number): void {
  editStack(objectId, 'Move deformer', (stack) => {
    const from = stack.findIndex((d) => d.id === deformerId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= stack.length) return stack;
    const out = stack.slice();
    const [item] = out.splice(from, 1);
    out.splice(to, 0, item);
    return out;
  });
}

/** Меняет параметры деформера. `mergeKey` склеивает записи одного перетаскивания поля. */
export function updateDeformerAction(
  objectId: string,
  deformerId: string,
  patch: Readonly<Record<string, unknown>>,
  mergeKey?: string,
): void {
  editStack(
    objectId,
    'Deformer settings',
    (stack) => stack.map((d) => (d.id === deformerId ? { ...d, ...patch } : d)),
    mergeKey,
  );
}
