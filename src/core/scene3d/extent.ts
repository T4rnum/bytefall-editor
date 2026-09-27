import { meshArea, meshRadius, meshSurface } from './meshSurface';
import {
  PRIMITIVE_AREA,
  PRIMITIVE_RADIUS,
  type Surface,
  levelFor,
  levelSpacing,
  primitiveSurface,
} from './surface';
import type { Mesh3D, Node3D, Primitive3D, Scene3D } from './types';

/** Размеры тел сцены: докуда они достают и сколько точек им нужно (режим B, LOD). */

/** Точек на тело не больше этого: дальше детализация грубеет. */
const MAX_BODY_POINTS = 100_000;

/** Расстояния от камеры, в которых лежит сцена: по ним идёт туман. */
export function sceneReach(
  scene: Scene3D,
  meshes: readonly Mesh3D[],
): { near: number; far: number } {
  const [ex, ey, ez] = scene.camera.position;
  let near = Infinity;
  let far = 0;
  for (const node of scene.nodes) {
    if (!node.visible) continue;
    const distance = Math.hypot(
      node.position[0] - ex,
      node.position[1] - ey,
      node.position[2] - ez,
    );
    const radius = bodyRadius(node, meshes);
    near = Math.min(near, Math.max(0, distance - radius));
    far = Math.max(far, distance + radius);
  }
  return Number.isFinite(near) && far > near ? { near, far } : { near: 0, far: 1 };
}

function modelOf(node: Node3D, meshes: readonly Mesh3D[]): Mesh3D | null {
  return node.kind === 'mesh' ? (meshes.find((m) => m.id === node.mesh) ?? null) : null;
}

const maxScale = (node: Node3D): number => Math.max(...node.scale.map(Math.abs));

/** Радиус шара вокруг положения тела, в который оно помещается, в единицах сцены. */
export function bodyRadius(node: Node3D, meshes: readonly Mesh3D[]): number {
  const model = modelOf(node, meshes);
  const local =
    node.kind === 'mesh' ? (model ? meshRadius(model) : 0) : PRIMITIVE_RADIUS[node.kind];
  return local * maxScale(node);
}

/**
 * Точки тела на уровне, который даёт нужный шаг в мире и укладывается в бюджет точек, и шаг
 * этого уровня в мире: у большого тела на большом холсте он грубее нужного.
 */
export function surfaceFor(
  node: Node3D,
  meshes: readonly Mesh3D[],
  worldSpacing: number,
): { surface: Surface; spacing: number } | null {
  const model = modelOf(node, meshes);
  if (node.kind === 'mesh' && !model) return null;
  const area = model ? meshArea(model) : PRIMITIVE_AREA[node.kind as Primitive3D];
  const scale = maxScale(node);
  let level = levelFor(worldSpacing / scale);
  // Уровень, на котором точек ещё не больше бюджета.
  while (level > 0 && area / levelSpacing(level) ** 2 > MAX_BODY_POINTS) level--;
  const surface = model
    ? meshSurface(model, level)
    : primitiveSurface(node.kind as Primitive3D, level);
  return { surface, spacing: levelSpacing(level) * scale };
}
