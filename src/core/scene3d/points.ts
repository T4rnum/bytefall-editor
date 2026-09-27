import { parseHex } from '../color';
import { bodyRadius, sceneReach, surfaceFor } from './extent';
import type { Surface } from './surface';
import type { Mesh3D, Node3D, Scene3D } from './types';
import {
  type View3D,
  bodyMatrix,
  cellsPerUnit,
  normalMatrix,
  project,
  sunDirection,
  viewOf,
} from './view';

/**
 * Точки поверхности сцены на экране — где стоят символы режима B (DESIGN.md, раздел 6). У каждой
 * — место в ячейках документа, глубина, цвет со светом и туманом, нормаль в координатах камеры и
 * номер тела. Считается на CPU и без GPU: экран, экспорт и тесты получают одно и то же.
 */
export interface ScenePoints {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly depth: Float32Array;
  /** Шаг точек на экране около точки, ячеек: размер символа облака. */
  readonly size: Float32Array;
  /** r, g, b долями, sRGB, со светом и туманом. */
  readonly color: Float32Array;
  /** Нормаль к камере: x вправо, y вверх, z на камеру. */
  readonly normal: Float32Array;
  /** Номер тела в `scene.nodes`. */
  readonly body: Uint16Array;
}

export interface PointOptions {
  /** Шаг точек в ячейках экрана. */
  readonly spacing: number;
  /**
   * Шаг один на всю сцену в мире, по глубине цели камеры: ближе точки реже, дальше гуще, как
   * настоящие частицы. Иначе у каждого тела свой шаг в мире, а на экране он одинаковый.
   */
  readonly world: boolean;
  /** Мерить экранный шаг тела по его ближнему краю: сетке нужна точка в каждой ячейке. */
  readonly nearEdge: boolean;
}

/** Мельче этого шага на экране у дальнего тела нет смысла: точки лягут друг на друга. */
const MIN_SCREEN_SPACING = 0.5;

/** Шаг точек тела в мире по настройкам и глубине его центра. */
function worldSpacingOf(
  view: View3D,
  options: PointOptions,
  reference: number,
  center: number,
  radius: number,
): number {
  if (options.world) {
    const spacing = options.spacing / cellsPerUnit(view, reference);
    return Math.max(spacing, MIN_SCREEN_SPACING / cellsPerUnit(view, center));
  }
  const depth = options.nearEdge ? Math.max(center - radius, view.near * 10) : center;
  return options.spacing / cellsPerUnit(view, depth);
}

/** Свет сцены числами: рассеянный, солнце, направление на него и туман. */
interface Lighting {
  readonly ambient: readonly number[];
  readonly sun: readonly number[];
  readonly dir: readonly number[];
  readonly fog: number;
  readonly near: number;
  readonly far: number;
}

function lightingOf(scene: Scene3D, meshes: readonly Mesh3D[]): Lighting {
  const { light } = scene;
  const ambient = parseHex(light.ambientColor);
  const sun = parseHex(light.sunColor);
  return {
    ambient: [ambient.r * light.ambient, ambient.g * light.ambient, ambient.b * light.ambient],
    sun: [sun.r * light.sun, sun.g * light.sun, sun.b * light.sun],
    dir: sunDirection(light),
    fog: scene.render.fog,
    ...sceneReach(scene, meshes),
  };
}

/** Накопитель точек: размер известен заранее — сумма точек тел, прошедших отсечение. */
class Collector {
  count = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly depth: Float32Array;
  readonly size: Float32Array;
  readonly color: Float32Array;
  readonly normal: Float32Array;
  readonly body: Uint16Array;

  constructor(capacity: number) {
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.depth = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    this.normal = new Float32Array(capacity * 3);
    this.body = new Uint16Array(capacity);
  }

  /** Точка на экране `at` с нормалью `n` в мире; цвет уже записан по номеру `count`. */
  push(view: View3D, at: Float64Array, size: number, n: Float64Array, body: number): void {
    const k = this.count;
    const { right, up, back } = view;
    this.x[k] = at[0];
    this.y[k] = at[1];
    this.depth[k] = at[2];
    this.size[k] = size;
    this.normal[k * 3] = n[0] * right[0] + n[1] * right[1] + n[2] * right[2];
    this.normal[k * 3 + 1] = n[0] * up[0] + n[1] * up[1] + n[2] * up[2];
    this.normal[k * 3 + 2] = n[0] * back[0] + n[1] * back[1] + n[2] * back[2];
    this.body[k] = body;
    this.count++;
  }

  finish(): ScenePoints {
    const n = this.count;
    return {
      count: n,
      x: this.x.subarray(0, n),
      y: this.y.subarray(0, n),
      depth: this.depth.subarray(0, n),
      size: this.size.subarray(0, n),
      color: this.color.subarray(0, n * 3),
      normal: this.normal.subarray(0, n * 3),
      body: this.body.subarray(0, n),
    };
  }
}

interface BodyPass {
  readonly node: Node3D;
  readonly index: number;
  readonly surface: Surface;
  /**
   * Во сколько раз точки тела реже, чем просили: больше единицы, когда выборку огрубил бюджет
   * точек. Символы тогда крупнее, чтобы между ними не было просветов.
   */
  readonly coarse: number;
  /** Шаг точек в мире, какой просили. */
  readonly spacing: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Нормаль точки в мире к камере — в `n`. false — изнанка замкнутого тела: её закрывает оно само.
 * У открытой поверхности изнанка видна и светится своей стороной.
 */
function facing(
  nm: Float64Array,
  sn: Float32Array,
  o: number,
  toEye: readonly number[],
  closed: boolean,
  n: Float64Array,
): boolean {
  const x = nm[0] * sn[o] + nm[1] * sn[o + 1] + nm[2] * sn[o + 2];
  const y = nm[3] * sn[o] + nm[4] * sn[o + 1] + nm[5] * sn[o + 2];
  const z = nm[6] * sn[o] + nm[7] * sn[o + 1] + nm[8] * sn[o + 2];
  const side = x * toEye[0] + y * toEye[1] + z * toEye[2];
  if (side < 0 && closed) return false;
  const k = (side < 0 ? -1 : 1) / (Math.hypot(x, y, z) || 1);
  n[0] = x * k;
  n[1] = y * k;
  n[2] = z * k;
  return true;
}

/** Точки одного тела: в мир, на экран, отсечение изнанки, свет и туман. */
function addBody(
  out: Collector,
  view: View3D,
  light: Lighting,
  pass: BodyPass,
  options: PointOptions,
): void {
  const { node, surface } = pass;
  const m = bodyMatrix(node);
  const nm = normalMatrix(node);
  const { r, g, b } = parseHex(node.color);
  const { positions: sp, colors: sc } = surface;
  const at = new Float64Array(3);
  const n = new Float64Array(3);
  const toEye = [...view.back];
  for (let i = 0; i < surface.count; i++) {
    const o = i * 3;
    const wx = m[0] * sp[o] + m[1] * sp[o + 1] + m[2] * sp[o + 2] + m[3];
    const wy = m[4] * sp[o] + m[5] * sp[o + 1] + m[6] * sp[o + 2] + m[7];
    const wz = m[8] * sp[o] + m[9] * sp[o + 1] + m[10] * sp[o + 2] + m[11];
    project(view, wx, wy, wz, at);
    if (at[2] <= view.near || at[0] < 0 || at[1] < 0) continue;
    if (at[0] >= view.width || at[1] >= view.height) continue;
    // Направление на камеру; у ортографической оно одно на всю сцену.
    if (view.perspective) {
      toEye[0] = view.eye[0] - wx;
      toEye[1] = view.eye[1] - wy;
      toEye[2] = view.eye[2] - wz;
    }
    if (!facing(nm, surface.normals, o, toEye, surface.closed, n)) continue;
    const lambert = Math.max(0, n[0] * light.dir[0] + n[1] * light.dir[1] + n[2] * light.dir[2]);
    const distance = view.perspective ? Math.hypot(toEye[0], toEye[1], toEye[2]) : at[2];
    const mist = 1 - light.fog * clamp01((distance - light.near) / (light.far - light.near));
    const c = out.count * 3;
    out.color[c] = r * (sc ? sc[o] : 1) * (light.ambient[0] + light.sun[0] * lambert) * mist;
    out.color[c + 1] =
      g * (sc ? sc[o + 1] : 1) * (light.ambient[1] + light.sun[1] * lambert) * mist;
    out.color[c + 2] =
      b * (sc ? sc[o + 2] : 1) * (light.ambient[2] + light.sun[2] * lambert) * mist;
    const step = options.world ? pass.spacing * cellsPerUnit(view, at[2]) : options.spacing;
    const size = step * pass.coarse;
    out.push(view, at, size, n, pass.index);
  }
}

/** Видно ли тело хоть краем: шар вокруг него против экрана и плоскости камеры. */
function inView(view: View3D, node: Node3D, radius: number, at: Float64Array): boolean {
  project(view, node.position[0], node.position[1], node.position[2], at);
  const depth = at[2];
  if (depth + radius <= view.near) return false;
  if (depth - radius <= view.near) return true;
  const reach = radius * cellsPerUnit(view, depth - radius);
  return (
    at[0] + reach >= 0 &&
    at[0] - reach <= view.width &&
    at[1] + reach >= 0 &&
    at[1] - reach <= view.height
  );
}

/** Освещённые точки видимых тел сцены на холсте `width` × `height` ячеек. */
export function scenePoints(
  scene: Scene3D,
  width: number,
  height: number,
  meshes: readonly Mesh3D[],
  options: PointOptions,
): ScenePoints {
  const view = viewOf(scene.camera, width, height);
  const { position, target } = scene.camera;
  const reference = Math.max(
    view.near,
    Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]),
  );
  const at = new Float64Array(3);
  const passes: BodyPass[] = [];
  scene.nodes.forEach((node, index) => {
    if (!node.visible) return;
    const radius = bodyRadius(node, meshes);
    if (!inView(view, node, radius, at)) return;
    const spacing = worldSpacingOf(view, options, reference, at[2], radius);
    const found = surfaceFor(node, meshes, spacing);
    if (!found) return;
    const coarse = Math.max(1, found.spacing / spacing);
    passes.push({ node, index, surface: found.surface, coarse, spacing });
  });
  const out = new Collector(passes.reduce((n, p) => n + p.surface.count, 0));
  const light = lightingOf(scene, meshes);
  for (const pass of passes) addBody(out, view, light, pass, options);
  return out.finish();
}
