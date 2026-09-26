import { newId } from '../document';
import {
  DEFAULT_CAMERA,
  DEFAULT_LIGHT,
  DEFAULT_QUANTIZE_3D,
  MAX_COORD_3D,
  MAX_FOV,
  MAX_LIGHT,
  MAX_ROTATION_3D,
  MAX_SCALE_3D,
  MIN_FOV,
  MIN_SCALE_3D,
  type Node3D,
  type Node3DKind,
  type Scene3D,
  type Vec3,
} from './types';

/** Анимируемые свойства тела и сцены. Вектор — три канала, остальное — одно число. */
export type Node3DProperty = 'position' | 'rotation' | 'scale';
export type Scene3DProperty =
  | 'cameraPosition'
  | 'cameraTarget'
  | 'fov'
  | 'size'
  | 'sunAzimuth'
  | 'sunElevation'
  | 'sun'
  | 'ambient';

export const NODE_3D_PROPERTIES: readonly Node3DProperty[] = ['position', 'rotation', 'scale'];
export const SCENE_3D_PROPERTIES: readonly Scene3DProperty[] = [
  'cameraPosition',
  'cameraTarget',
  'fov',
  'size',
  'sunAzimuth',
  'sunElevation',
  'sun',
  'ambient',
];

export const isVectorProperty = (property: Node3DProperty | Scene3DProperty): boolean =>
  property === 'position' ||
  property === 'rotation' ||
  property === 'scale' ||
  property === 'cameraPosition' ||
  property === 'cameraTarget';

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : Math.max(min, Math.min(max, 0));

/** Пределы канала свойства: по ним ограничиваются ключи и проверяется файл. */
export function limits3D(property: Node3DProperty | Scene3DProperty): { min: number; max: number } {
  switch (property) {
    case 'rotation':
    case 'sunAzimuth':
      return { min: -MAX_ROTATION_3D, max: MAX_ROTATION_3D };
    case 'scale':
      return { min: MIN_SCALE_3D, max: MAX_SCALE_3D };
    case 'fov':
      return { min: MIN_FOV, max: MAX_FOV };
    case 'size':
      return { min: 0.01, max: MAX_COORD_3D };
    case 'sunElevation':
      return { min: -90, max: 90 };
    case 'sun':
    case 'ambient':
      return { min: 0, max: MAX_LIGHT };
    default:
      return { min: -MAX_COORD_3D, max: MAX_COORD_3D };
  }
}

/** Значение в пределах свойства, округлённое до миллионных, как любое число ключа. */
export function limitValue3D(
  property: Node3DProperty | Scene3DProperty,
  value: readonly number[],
): number[] {
  const { min, max } = limits3D(property);
  const n = isVectorProperty(property) ? 3 : 1;
  return Array.from({ length: n }, (_, i) => round6(clamp(value[i] ?? 0, min, max)));
}

const vec = (v: readonly number[]): Vec3 => [v[0], v[1], v[2]];

export const readNode3DValue = (node: Node3D, property: Node3DProperty): number[] => [
  ...node[property],
];

export function writeNode3DValue(
  node: Node3D,
  property: Node3DProperty,
  value: readonly number[],
): Node3D {
  const next = vec(limitValue3D(property, value));
  const same = next.every((v, i) => v === node[property][i]);
  return same ? node : { ...node, [property]: next };
}

export function readScene3DValue(scene: Scene3D, property: Scene3DProperty): number[] {
  const { camera, light } = scene;
  switch (property) {
    case 'cameraPosition':
      return [...camera.position];
    case 'cameraTarget':
      return [...camera.target];
    case 'fov':
    case 'size':
      return [camera[property]];
    default:
      return [light[property]];
  }
}

export function writeScene3DValue(
  scene: Scene3D,
  property: Scene3DProperty,
  value: readonly number[],
): Scene3D {
  const v = limitValue3D(property, value);
  switch (property) {
    case 'cameraPosition':
      return { ...scene, camera: { ...scene.camera, position: vec(v) } };
    case 'cameraTarget':
      return { ...scene, camera: { ...scene.camera, target: vec(v) } };
    case 'fov':
    case 'size':
      return { ...scene, camera: { ...scene.camera, [property]: v[0] } };
    default:
      return { ...scene, light: { ...scene.light, [property]: v[0] } };
  }
}

export function createScene3D(nodes: readonly Node3D[] = []): Scene3D {
  return { nodes, camera: DEFAULT_CAMERA, light: DEFAULT_LIGHT, quantize: DEFAULT_QUANTIZE_3D };
}

export function createNode3D(
  kind: Node3DKind,
  name: string,
  patch: Partial<Omit<Node3D, 'id' | 'kind'>> = {},
  id: string = newId('body'),
): Node3D {
  return {
    id,
    name,
    kind,
    mesh: null,
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#c2c3c7',
    ...patch,
  };
}

export const findNode3D = (scene: Scene3D, id: string): Node3D | undefined =>
  scene.nodes.find((n) => n.id === id);

export const addNode3D = (scene: Scene3D, node: Node3D): Scene3D => ({
  ...scene,
  nodes: [...scene.nodes, node],
});

export function removeNode3D(scene: Scene3D, id: string): Scene3D {
  const nodes = scene.nodes.filter((n) => n.id !== id);
  return nodes.length === scene.nodes.length ? scene : { ...scene, nodes };
}

export function updateNode3D(scene: Scene3D, id: string, fn: (node: Node3D) => Node3D): Scene3D {
  let changed = false;
  const nodes = scene.nodes.map((n) => {
    if (n.id !== id) return n;
    const next = fn(n);
    changed ||= next !== n;
    return next;
  });
  return changed ? { ...scene, nodes } : scene;
}
