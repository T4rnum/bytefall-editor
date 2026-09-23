import { deleteKeys, keyCurrentValue, setTargetValue, unanimate } from '../../core/keyframes';
import { roundTime } from '../../core/time';
import {
  type Interpolation,
  type KeyRef,
  type ObjectProperty,
  type Track,
  type TrackTarget,
  keyStateAt,
  moveKeys,
  setKeysInterpolation,
  trackKey,
} from '../../core/tracks';
import type { Easing } from '../../core/easing';
import { useDocumentStore } from './documentStore';
import { useEditorStore } from './editorStore';
import { notify } from './notifyStore';
import { editableSelectedObject } from './objectActions';

const docState = () => useDocumentStore.getState();
const editor = () => useEditorStore.getState();

/** Ключи ставят на остановленной сцене: иначе момент уехал бы из-под правки. */
function stopPlayback(): void {
  if (editor().isPlaying) editor().setPlaying(false);
}

/**
 * Кнопка ключа у свойства: ключа в этот момент нет — ставит его с тем, что видно на экране;
 * есть — убирает. Последний ключ уносит анимацию, свойство замирает в текущем значении.
 */
export function toggleKeyAction(target: TrackTarget): void {
  stopPlayback();
  const { animation, time, commitAnimation } = docState();
  if (keyStateAt(animation.tracks, target, time) === 'key') {
    const ref = { track: trackKey(target), time: roundTime(time) };
    commitAnimation('Delete key', deleteKeys(animation, [ref], time));
  } else {
    commitAnimation('Set key', keyCurrentValue(animation, target, time));
  }
}

const TRANSFORM_PROPERTIES: readonly ObjectProperty[] = ['position', 'rotation', 'scale'];

/** K: ключи положения, поворота и масштаба выбранного объекта в текущий момент, одной записью. */
export function keySelectedObjectAction(): void {
  const obj = editableSelectedObject();
  if (!obj) {
    notify('Выберите объект, чтобы поставить ключ');
    return;
  }
  stopPlayback();
  const { animation, time, commitAnimation } = docState();
  let next = animation;
  for (const property of TRANSFORM_PROPERTIES) {
    next = keyCurrentValue(next, { node: 'object', id: obj.id, property }, time);
  }
  commitAnimation('Set transform keys', next);
}

/** Перестаёт анимировать свойство: оно остаётся в том значении, что видно сейчас. */
export function unanimateAction(target: TrackTarget): void {
  const { animation, time, commitAnimation } = docState();
  commitAnimation('Stop animating', unanimate(animation, target, time));
}

/**
 * Значение из поля панели, которая правит анимацию, а не сцену на экране: непрозрачность слоя,
 * параметр эффекта. У анимированного свойства ставит ключ, у обычного меняет само значение.
 */
export function setTargetValueAction(
  target: TrackTarget,
  value: readonly number[],
  label: string,
  mergeKey?: string,
): void {
  const { animation, time, commitAnimation } = docState();
  commitAnimation(label, setTargetValue(animation, target, time, value), undefined, mergeKey);
}

/** Delete с выделенными ключами удаляет их. false — ключей не выделено, Delete для другого. */
export function deleteSelectedKeysAction(): boolean {
  const keys = editor().selectedKeys;
  if (keys.length === 0) return false;
  const { animation, time, commitAnimation } = docState();
  commitAnimation('Delete keys', deleteKeys(animation, keys, time));
  editor().setSelectedKeys([]);
  return true;
}

/**
 * Сдвиг ключей перетаскиванием. Считается всякий раз от треков и выделения в начале жеста:
 * ключ, который сдвинутый накрыл по пути, возвращается, когда его миновали.
 */
export function moveKeysAction(
  original: readonly Track[],
  refs: readonly KeyRef[],
  delta: number,
  mergeKey: string,
): void {
  const { animation, commitAnimation } = docState();
  const moved = moveKeys(original, refs, delta);
  commitAnimation('Move keys', { ...animation, tracks: moved.tracks }, undefined, mergeKey);
  editor().setSelectedKeys(moved.refs);
}

export function setKeysInterpolationAction(interpolation: Interpolation, easing?: Easing): void {
  const keys = editor().selectedKeys;
  if (keys.length === 0) return;
  const { animation, commitAnimation } = docState();
  const tracks = setKeysInterpolation(animation.tracks, keys, interpolation, easing);
  commitAnimation('Key interpolation', { ...animation, tracks });
}
