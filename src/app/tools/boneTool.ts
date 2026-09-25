import { type Document, newId } from '../../core/document';
import type { Point } from '../../core/geometry';
import { findObject } from '../../core/object';
import { MIN_BONE_LENGTH, addRigNode, createBone, isBone } from '../../core/rig';
import { boneTail, onBoneTail } from './rig';
import type { PointerInfo, Tool, ToolEnv } from './types';

/** Концы костей притягиваются к половине ячейки — к углу или центру; Shift отпускает. */
const SNAP = 0.5;

const snap = (p: Point): Point => ({
  x: Math.round(p.x / SNAP) * SNAP,
  y: Math.round(p.y / SNAP) * SNAP,
});

/** Кость, которую сейчас тянут: откуда, чья она и на каком слое. */
interface Draw {
  readonly id: string;
  readonly head: Point;
  readonly parentId: string | null;
  readonly layerId: string;
}

/**
 * С чего начинается новая кость. От конца выбранной кости — её ребёнок, и цепочка растёт как
 * в Blender. Иначе кость начинается под указателем; если выбран объект с символами, она
 * становится его ребёнком, чтобы персонаж ездил вместе со своими костями.
 */
function startDraw(env: ToolEnv, info: PointerInfo): Draw | null {
  const selected = env.selectedObjectId ? findObject(env.doc, env.selectedObjectId) : undefined;
  const id = newId('bone');
  if (selected && isBone(selected) && onBoneTail(env.doc, selected, info.point, env.zoom)) {
    const head = boneTail(env.doc, selected);
    return { id, head, parentId: selected.id, layerId: selected.layerId };
  }
  if (!env.layer) return null;
  const head = info.shift ? info.point : snap(info.point);
  const parentId = selected && selected.rig === null ? selected.id : null;
  return { id, head, parentId, layerId: env.layer.id };
}

/** Документ с новой костью до точки под указателем. null — кость ещё слишком короткая. */
function drawResult(env: ToolEnv, draw: Draw, info: PointerInfo): Document | null {
  const tail = info.shift ? info.point : snap(info.point);
  if (Math.hypot(tail.x - draw.head.x, tail.y - draw.head.y) < MIN_BONE_LENGTH) return null;
  const bones = env.doc.objects.filter(isBone).length;
  const bone = createBone({
    id: draw.id,
    name: `Кость ${bones + 1}`,
    layerId: draw.layerId,
    head: draw.head,
    tail,
  });
  return addRigNode(env.doc, bone, draw.parentId);
}

/**
 * Кости рига. Нажатие ставит сустав, отпускание — конец кости; нажатие на конце выбранной кости
 * продолжает цепочку. Концы притягиваются к половине ячейки, с Shift — свободно.
 */
export function createBoneTool(): Tool {
  let draw: Draw | null = null;
  const stop = (env: ToolEnv): void => {
    draw = null;
    env.setDraft(null);
  };
  return {
    id: 'bone',
    label: 'Кость',
    hotkey: 'j',
    cursor: 'crosshair',
    onPointerDown(env, info) {
      if (info.button === 0) draw = startDraw(env, info);
    },
    onPointerMove(env, info) {
      if (draw) env.setDraft(drawResult(env, draw, info));
    },
    onPointerUp(env, info) {
      if (!draw) return;
      const finished = draw;
      const next = drawResult(env, finished, info);
      stop(env);
      if (!next) return;
      env.commitDocument('Add bone', next);
      env.setSelectedObject(finished.id);
    },
    onKeyDown(env, event) {
      if (event.key !== 'Escape' || !draw) return false;
      stop(env);
      return true;
    },
    cancel: stop,
  };
}
