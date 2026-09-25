import { type Animation, mapFrames } from '../../core/animation';
import {
  type Deformer,
  type DeformerKind,
  MAX_DEFORMERS_PER_OBJECT,
  createDeformer,
} from '../../core/deformers';
import { setTargetValue } from '../../core/keyframes';
import { findObject, updateObject } from '../../core/object';
import { bindSkin } from '../../core/skinBind';
import { DEFORMER_PARAMS, type TrackTarget, findTrack } from '../../core/tracks';
import { plural } from '../ui/plural';
import { useDocumentStore } from './documentStore';
import { notify } from './notifyStore';

/**
 * Деформеры — модификаторы объекта, а не рисунок кадра: правка стека идёт во все кадры, где
 * объект есть, иначе волна пропадала бы при смене кадра.
 */
function withStack(
  anim: Animation,
  objectId: string,
  fn: (stack: readonly Deformer[]) => readonly Deformer[],
): Animation {
  return mapFrames(anim, (doc) => {
    const obj = findObject(doc, objectId);
    if (!obj) return doc;
    const deformers = fn(obj.deformers);
    return deformers === obj.deformers ? doc : updateObject(doc, objectId, { deformers });
  });
}

function editStack(
  objectId: string,
  label: string,
  fn: (stack: readonly Deformer[]) => readonly Deformer[],
): void {
  const { animation, commitAnimation } = useDocumentStore.getState();
  commitAnimation(label, withStack(animation, objectId, fn));
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
  const created = createDeformer(kind);
  let deformer: Deformer = created;
  if (created.kind === 'skin') {
    // Скиннинг без костей ничего не делает: привязываем сразу, а без костей не добавляем.
    const bones = bindSkin(useDocumentStore.getState().doc, objectId);
    if (bones.length === 0) {
      notify('У объекта нет костей: выбери его и нарисуй их инструментом «Кость» (J)', 'error');
      return;
    }
    deformer = { ...created, bones };
  }
  editStack(objectId, 'Add deformer', (stack) => [...stack, deformer]);
}

/**
 * Поза покоя — сейчас: скиннинг заново привязывается к костям объекта такими, какие они на
 * экране. Новые кости попадают в привязку, пропавшие уходят из неё.
 */
export function rebindSkinAction(objectId: string, deformerId: string): void {
  const bones = bindSkin(useDocumentStore.getState().doc, objectId);
  editStack(objectId, 'Bind skin', (stack) =>
    stack.map((d) => (d.id === deformerId && d.kind === 'skin' ? { ...d, bones } : d)),
  );
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

const isParam = (key: string): boolean => (DEFORMER_PARAMS as readonly string[]).includes(key);

/**
 * Меняет параметры деформера. Числовой параметр, который ведут ключи, получает ключ в текущий
 * момент; остальное меняется во всех кадрах объекта. Список деформеров берётся из кадров, а не
 * из вычисленной сцены: иначе значения ключей на этот момент осели бы в кадре.
 * `mergeKey` склеивает записи одного перетаскивания поля.
 */
export function updateDeformerAction(
  objectId: string,
  deformerId: string,
  patch: Readonly<Record<string, unknown>>,
  mergeKey?: string,
): void {
  const { animation, time, commitAnimation } = useDocumentStore.getState();
  let next = animation;
  const plain: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const target = { node: 'deformer', id: deformerId, property: key } as TrackTarget;
    if (typeof value === 'number' && isParam(key) && findTrack(next.tracks, target)) {
      next = setTargetValue(next, target, time, [value]);
    } else {
      plain[key] = value;
    }
  }
  if (Object.keys(plain).length > 0) {
    next = withStack(next, objectId, (stack) =>
      stack.map((d) => (d.id === deformerId ? { ...d, ...plain } : d)),
    );
  }
  commitAnimation('Deformer settings', next, undefined, mergeKey);
}
