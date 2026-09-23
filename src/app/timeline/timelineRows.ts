import type { Animation } from '../../core/animation';
import type { Document } from '../../core/document';
import type { DeformerKind } from '../../core/deformers';
import { EFFECT_KINDS } from '../../core/effects';
import {
  type DeformerParam,
  type EffectParam,
  OBJECT_PROPERTIES,
  type ObjectProperty,
  type Track,
  type TrackTarget,
  findTrack,
  nodeKey,
  trackKey,
} from '../../core/tracks';

/** Строка таймлайна: заголовок узла или свойство с ключами. */
export type TimelineRow =
  | { readonly kind: 'node'; readonly key: string; readonly label: string }
  | {
      readonly kind: 'track';
      readonly key: string;
      readonly target: TrackTarget;
      readonly label: string;
      /** Как свойство называется в подсказке ромба: «положение», «высота». */
      readonly subject: string;
      readonly track: Track | undefined;
    };

const OBJECT_LABELS: Readonly<Record<ObjectProperty, string>> = {
  position: 'Положение',
  rotation: 'Поворот',
  scale: 'Масштаб',
  opacity: 'Непрозрачность',
  tint: 'Оттенок',
};

const EFFECT_LABELS: Readonly<Record<EffectParam, string>> = {
  period: 'Период',
  amplitude: 'Амплитуда',
  spread: 'Разброс',
  wavelength: 'Длина волны',
  density: 'Плотность',
  dx: 'Скорость по X',
  dy: 'Скорость по Y',
  height: 'Высота',
};

const DEFORMER_LABELS: Readonly<Record<DeformerParam, string>> = {
  amplitude: 'Размах',
  wavelength: 'Длина волны',
  period: 'Период',
  angle: 'Угол',
  strength: 'Сила',
  radius: 'Радиус',
  inner: 'Размер в центре',
  outer: 'Размер на краю',
  length: 'Длина градиента',
  amount: 'Сила цвета',
};

const DEFORMER_KINDS: Readonly<Record<DeformerKind, string>> = {
  wave: 'Волна',
  jitter: 'Дрожание',
  twist: 'Вихрь',
  scaleFalloff: 'Размер от центра',
  colorRamp: 'Градиент',
};

function labelOf(target: TrackTarget): string {
  switch (target.node) {
    case 'object':
      return OBJECT_LABELS[target.property];
    case 'layer':
      return 'Непрозрачность слоя';
    case 'effect':
      return EFFECT_LABELS[target.property];
    case 'deformer':
      return DEFORMER_LABELS[target.property];
  }
}

function trackRow(anim: Animation, target: TrackTarget): TimelineRow {
  const label = labelOf(target);
  return {
    kind: 'track',
    key: trackKey(target),
    target,
    label,
    subject: label.toLowerCase(),
    track: findTrack(anim.tracks, target),
  };
}

/** Имя объекта: в текущем кадре его может не быть, тогда — из первого кадра, где он есть. */
function objectName(anim: Animation, doc: Document, id: string): string {
  const here = doc.objects.find((o) => o.id === id);
  if (here) return here.name;
  for (const frame of anim.frames) {
    const obj = frame.objects.find((o) => o.id === id);
    if (obj) return obj.name;
  }
  return id;
}

function nodeLabel(anim: Animation, doc: Document, track: Track): string {
  if (track.node === 'object') return objectName(anim, doc, track.id);
  if (track.node === 'layer') return doc.layers.find((l) => l.id === track.id)?.name ?? track.id;
  if (track.node === 'deformer') {
    for (const obj of doc.objects) {
      const deformer = obj.deformers.find((d) => d.id === track.id);
      if (deformer) return `${DEFORMER_KINDS[deformer.kind]} · ${obj.name}`;
    }
    return track.id;
  }
  for (const layer of doc.layers) {
    const effect = layer.effects.find((e) => e.id === track.id);
    if (!effect) continue;
    const kind = EFFECT_KINDS.find((k) => k.kind === effect.kind)?.label ?? effect.kind;
    return `${kind} · ${layer.name}`;
  }
  return track.id;
}

/**
 * Строки таймлайна. Выбранный объект идёт первым и со всеми свойствами, даже неанимированными:
 * так ключ можно поставить прямо здесь. Остальные узлы — только с анимированными свойствами,
 * в порядке, в каком их треки появились.
 */
export function timelineRows(
  anim: Animation,
  doc: Document,
  selectedObjectId: string | null,
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const selected = selectedObjectId ? nodeKey('object', selectedObjectId) : null;
  if (selectedObjectId && doc.objects.some((o) => o.id === selectedObjectId)) {
    rows.push({ kind: 'node', key: selected!, label: objectName(anim, doc, selectedObjectId) });
    for (const property of OBJECT_PROPERTIES) {
      rows.push(trackRow(anim, { node: 'object', id: selectedObjectId, property }));
    }
  }
  const seen = new Set<string>(selected && rows.length > 0 ? [selected] : []);
  for (const track of anim.tracks) {
    const key = nodeKey(track.node, track.id);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ kind: 'node', key, label: nodeLabel(anim, doc, track) });
    for (const own of anim.tracks) {
      if (own.node === track.node && own.id === track.id) rows.push(trackRow(anim, own));
    }
  }
  return rows;
}
