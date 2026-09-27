import { type Affine, visualDirection, visualDistance } from '../../core/affine';
import type { Point } from '../../core/geometry';
import type { SceneObject } from '../../core/object';
import { objectQuad } from '../../core/placement';
import { type ScaleHandle, pivotInDocument } from '../../core/transformGesture';

/**
 * Что можно схватить у гизмо. Опоры среди ручек нет: по умолчанию она в центре объекта, и
 * перетаскивание «за середину» двигало бы её вместо объекта. Опору переносят с Alt.
 */
export type GizmoHandle =
  { readonly kind: 'scale'; readonly handle: ScaleHandle } | { readonly kind: 'rotate' };

/** Гизмо в координатах документа: рамка, ручки масштаба, ручка поворота на стебле и опора. */
export interface GizmoLayout {
  readonly quad: readonly Point[];
  readonly scale: readonly { readonly handle: ScaleHandle; readonly at: Point }[];
  readonly stem: Point;
  readonly knob: Point;
  readonly pivot: Point;
}

/** Радиус захвата ручки в пикселях экрана: при любом зуме ручку одинаково легко схватить. */
export const HANDLE_HIT_PX = 8;
/** Ручка поворота вынесена над рамкой, чтобы не спорить с ручками масштаба. */
const KNOB_OFFSET_PX = 26;
/**
 * Боковая ручка появляется, только если сторона на экране длиннее этого. Иначе у объекта в
 * одну-две ячейки ручки накрыли бы всю середину и схватить его для переноса было бы негде.
 */
const EDGE_HANDLE_MIN_PX = 3 * HANDLE_HIT_PX;

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Раскладка гизмо выбранного объекта. `zoom` — пикселей на высоту ячейки, `aspect` — ширина
 * ячейки к высоте: ручка поворота отстоит от рамки на одно и то же число пикселей, как бы
 * близко ни подъехала камера и какой бы ни была ячейка.
 */
export function gizmoLayout(
  obj: SceneObject,
  world: Affine,
  zoom: number,
  aspect = 1,
): GizmoLayout {
  const [nw, ne, se, sw] = objectQuad(obj, world);
  const top = mid(nw, ne);
  // «Вверх» самого объекта: от нижней стороны к верхней, у повёрнутого — повёрнутое.
  const up = { x: nw.x - sw.x, y: nw.y - sw.y };
  const height = visualDistance(sw, nw, aspect) || 1;
  const width = visualDistance(nw, ne, aspect);
  const reach = KNOB_OFFSET_PX / zoom / height;
  const corners: GizmoLayout['scale'] = [
    { handle: 'nw', at: nw },
    { handle: 'ne', at: ne },
    { handle: 'se', at: se },
    { handle: 'sw', at: sw },
  ];
  const across: GizmoLayout['scale'] =
    width * zoom >= EDGE_HANDLE_MIN_PX
      ? [
          { handle: 'n', at: top },
          { handle: 's', at: mid(se, sw) },
        ]
      : [];
  const along: GizmoLayout['scale'] =
    height * zoom >= EDGE_HANDLE_MIN_PX
      ? [
          { handle: 'e', at: mid(ne, se) },
          { handle: 'w', at: mid(sw, nw) },
        ]
      : [];
  return {
    quad: [nw, ne, se, sw],
    scale: [...corners, ...across, ...along],
    stem: top,
    knob: { x: top.x + up.x * reach, y: top.y + up.y * reach },
    pivot: pivotInDocument(obj.transform, world),
  };
}

/**
 * Ручка под указателем, если он в радиусе захвата. Ручки маленького объекта налезают друг на
 * друга, поэтому выигрывает ближайшая, а не первая по списку.
 */
export function hitGizmo(
  layout: GizmoLayout,
  point: Point,
  zoom: number,
  aspect = 1,
): GizmoHandle | null {
  const candidates: { handle: GizmoHandle; at: Point }[] = [
    { handle: { kind: 'rotate' }, at: layout.knob },
    ...layout.scale.map((s) => ({
      handle: { kind: 'scale', handle: s.handle } as const,
      at: s.at,
    })),
  ];
  let best: GizmoHandle | null = null;
  let bestDistance = HANDLE_HIT_PX / zoom;
  for (const { handle, at } of candidates) {
    const distance = visualDistance(point, at, aspect);
    if (distance <= bestDistance) {
      best = handle;
      bestDistance = distance;
    }
  }
  return best;
}

/** Курсор над ручкой: стрелки масштаба по оси экрана, ближайшей к направлению ручки. */
export function handleCursor(layout: GizmoLayout, handle: GizmoHandle, aspect = 1): string {
  if (handle.kind === 'rotate') return 'grab';
  const at = layout.scale.find((s) => s.handle === handle.handle)?.at ?? layout.pivot;
  const center = mid(layout.quad[0], layout.quad[2]);
  const angle = (visualDirection(center, at, aspect) * 180) / Math.PI;
  // Четыре пары стрелок по 45°: какая ближе к направлению от центра к ручке.
  const cursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
  return cursors[Math.round(((angle % 180) + 180) / 45) % 4];
}
