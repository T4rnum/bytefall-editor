import { type Affine, visualDistance } from '../../core/affine';
import { type Document, findLayer } from '../../core/document';
import { cellAspect } from '../../core/font/font';
import { type Point, segmentDistance } from '../../core/geometry';
import type { SceneObject } from '../../core/object';
import { objectMatrices } from '../../core/placement';
import { type Bone, boneEnds, isBone } from '../../core/rig';
import { HANDLE_HIT_PX } from './gizmo';

/** Полуширина кости на экране: тонкая кость читается отрезком, а не ромбом. */
const BONE_WIDTH_PX = 5;
/** Размах перекрестья контроллера на экране. */
const CONTROL_PX = 9;

/**
 * Расстояния и размеры рига — в пикселях экрана, а ячейка бывает неквадратной: точки переводятся
 * в видимое пространство, где X ячейки умножен на `aspect`, и обратно.
 */
const seen = (p: Point, aspect: number): Point => ({ x: p.x * aspect, y: p.y });
const back = (p: Point, aspect: number): Point => ({ x: p.x / aspect, y: p.y });

/** Узлы рига, которые видно: сам узел и его слой не скрыты. Сверху вниз по списку. */
function shownRig(doc: Document): { node: SceneObject; world: Affine }[] {
  const matrices = objectMatrices(doc);
  return doc.objects
    .filter((o) => o.rig !== null && o.visible && findLayer(doc, o.layerId)?.visible !== false)
    .map((node) => ({ node, world: matrices.get(node.id) as Affine }))
    .reverse();
}

/**
 * Узел рига под указателем. Кость хватается за отрезок, контроллер — за точку, радиус — в
 * пикселях экрана, как у ручек гизмо. Выигрывает ближайший: кости цепочки сходятся в суставах.
 * Контроллер важнее кости: он стоит на её конце, и тянут именно за него.
 */
export function rigNodeAt(doc: Document, point: Point, zoom: number): SceneObject | undefined {
  const reach = HANDLE_HIT_PX / zoom;
  const aspect = cellAspect(doc.font);
  const p = seen(point, aspect);
  const nearest = (bones: boolean): SceneObject | undefined => {
    let best: SceneObject | undefined;
    let bestDistance = reach;
    for (const { node, world } of shownRig(doc)) {
      if (isBone(node) !== bones) continue;
      const ends = isBone(node) ? boneEnds(world, node.rig) : null;
      const distance = ends
        ? segmentDistance(p, seen(ends.head, aspect), seen(ends.tail, aspect))
        : visualDistance(point, { x: world.e, y: world.f }, aspect);
      if (distance <= bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  };
  return nearest(false) ?? nearest(true);
}

/**
 * Кость в цепочке: её родитель — тоже кость. Такая кость держится за сустав родителя, и её не
 * переносят, а поворачивают, за что ни возьми, — как в позе у Blender.
 */
export function isChained(doc: Document, obj: SceneObject): boolean {
  if (!isBone(obj) || obj.parentId === null) return false;
  const parent = doc.objects.find((o) => o.id === obj.parentId);
  return parent !== undefined && isBone(parent);
}

/** Конец кости в координатах документа. */
export function boneTail(doc: Document, bone: Bone): Point {
  return boneEnds(objectMatrices(doc).get(bone.id) as Affine, bone.rig).tail;
}

/** Указатель у конца кости: за конец кость поворачивают вокруг сустава и от него же тянут новую. */
export function onBoneTail(doc: Document, bone: Bone, point: Point, zoom: number): boolean {
  const tail = boneTail(doc, bone);
  return visualDistance(point, tail, cellAspect(doc.font)) <= HANDLE_HIT_PX / zoom;
}

/** Что рисует оверлей: кости ромбами, суставы и контроллеры кольцами, выбранный — акцентом. */
export interface RigLayout {
  readonly lines: Point[];
  readonly selectedLines: Point[];
  readonly rings: Point[];
  readonly selectedRings: Point[];
}

/** Ромб кости: широкая часть у сустава, остриё на конце, как у костей в Blender. */
function boneLines(from: Point, to: Point, zoom: number, aspect: number): Point[] {
  const head = seen(from, aspect);
  const tail = seen(to, aspect);
  const length = Math.hypot(tail.x - head.x, tail.y - head.y) || 1;
  const ux = (tail.x - head.x) / length;
  const uy = (tail.y - head.y) / length;
  const w = Math.min(length * 0.2, BONE_WIDTH_PX / zoom);
  const m = { x: head.x + ux * length * 0.2, y: head.y + uy * length * 0.2 };
  const left = back({ x: m.x - uy * w, y: m.y + ux * w }, aspect);
  const right = back({ x: m.x + uy * w, y: m.y - ux * w }, aspect);
  return [from, left, left, to, to, right, right, from];
}

function controlLines(at: Point, zoom: number, aspect: number): Point[] {
  const r = CONTROL_PX / zoom;
  const rx = r / aspect;
  return [
    { x: at.x - rx, y: at.y },
    { x: at.x + rx, y: at.y },
    { x: at.x, y: at.y - r },
    { x: at.x, y: at.y + r },
  ];
}

/** Раскладка рига для оверлея. null, если рига в документе нет. */
export function rigLayout(
  doc: Document,
  selectedId: string | null,
  zoom: number,
): RigLayout | null {
  const shown = shownRig(doc);
  if (shown.length === 0) return null;
  const aspect = cellAspect(doc.font);
  const out: RigLayout = { lines: [], selectedLines: [], rings: [], selectedRings: [] };
  for (const { node, world } of shown) {
    const selected = node.id === selectedId;
    const at = { x: world.e, y: world.f };
    const lines = isBone(node)
      ? boneLines(at, boneEnds(world, node.rig).tail, zoom, aspect)
      : controlLines(at, zoom, aspect);
    (selected ? out.selectedLines : out.lines).push(...lines);
    (selected ? out.selectedRings : out.rings).push(at);
  }
  return out;
}
