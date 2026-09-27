import type { Rect } from '../geometry';
import { type ScenePoints, scenePoints } from './points';
import type { Mesh3D, Scene3D } from './types';

/**
 * Выбор тела на экране. Считается по тем же точкам поверхности, что и символы режима B, поэтому
 * одинаково работает во всех режимах и без GPU: у режима A картинка та же с точностью до ячейки.
 */

/** Шаг точек для выбора: в каждую ячейку тела попадает хотя бы одна. */
const PICK_SPACING = 0.7;
/** Насколько далеко от указателя может быть точка тела, ячеек. */
const PICK_REACH = 0.75;

const pointsOf = (
  scene: Scene3D,
  width: number,
  height: number,
  meshes: readonly Mesh3D[],
  aspect: number,
) =>
  scenePoints(scene, width, height, meshes, {
    spacing: PICK_SPACING,
    world: false,
    nearEdge: true,
    aspect,
  });

/** Ближнее к камере тело под точкой экрана (ячейки документа), или null — там пусто. */
export function pickBody3D(
  scene: Scene3D,
  width: number,
  height: number,
  meshes: readonly Mesh3D[],
  x: number,
  y: number,
  aspect = 1,
): string | null {
  const points = pointsOf(scene, width, height, meshes, aspect);
  let best = -1;
  for (let i = 0; i < points.count; i++) {
    if (Math.abs(points.x[i] - x) > PICK_REACH || Math.abs(points.y[i] - y) > PICK_REACH) continue;
    if (best < 0 || points.depth[i] < points.depth[best]) best = i;
  }
  return best < 0 ? null : scene.nodes[points.body[best]].id;
}

function boundsOf(points: ScenePoints): Rect | null {
  if (points.count === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.count; i++) {
    minX = Math.min(minX, points.x[i]);
    minY = Math.min(minY, points.y[i]);
    maxX = Math.max(maxX, points.x[i]);
    maxY = Math.max(maxY, points.y[i]);
  }
  const x = Math.floor(minX);
  const y = Math.floor(minY);
  return { x, y, w: Math.floor(maxX) + 1 - x, h: Math.floor(maxY) + 1 - y };
}

/** Рамки тел, посчитанные для сцены: выбранное тело рисуется рамкой на каждый кадр вьюпорта. */
const boundsCache = new WeakMap<
  Scene3D,
  { meshes: readonly Mesh3D[]; rects: Map<string, Rect | null> }
>();

/** Рамка тела на экране в ячейках, как его видно без других тел, или null — его не видно. */
export function body3DBounds(
  scene: Scene3D,
  width: number,
  height: number,
  meshes: readonly Mesh3D[],
  bodyId: string,
  aspect = 1,
): Rect | null {
  let known = boundsCache.get(scene);
  if (!known || known.meshes !== meshes) {
    known = { meshes, rects: new Map() };
    boundsCache.set(scene, known);
  }
  const key = `${width}x${height}@${aspect}:${bodyId}`;
  const cached = known.rects.get(key);
  if (cached !== undefined) return cached;
  const node = scene.nodes.find((n) => n.id === bodyId);
  const alone = { ...scene, nodes: node ? [node] : [] };
  const rect = node ? boundsOf(pointsOf(alone, width, height, meshes, aspect)) : null;
  known.rects.set(key, rect);
  return rect;
}
