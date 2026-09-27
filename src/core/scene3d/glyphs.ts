import type { Cell } from '../cell';
import { type CellGrid, keyOf } from '../grid';
import {
  type CellSamples,
  LUMA_WEIGHTS,
  type QuantizeOptions,
  luminance,
  quantize,
} from '../quantize';
import { sceneReach } from './extent';
import { type ScenePoints, scenePoints } from './points';
import type { Mesh3D, Scene3D } from './types';
import { cellsPerUnit, viewOf } from './view';

/**
 * Режим B (DESIGN.md, раздел 6): символы стоят на поверхности тел, свет считается на каждый, и
 * яркость выбирает символ из рампы — тем же квантайзером, что у режима A и импорта картинки.
 */

/** Символ облака: центр в ячейках документа, размер в ячейках, ячейка и тело. */
export interface Sprite3D {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly cell: Cell;
  readonly body: string;
}

/** Облако не больше этого: номер символа идёт в ключ ячейки квантайзера. */
const MAX_SPRITES = 65535;
/** Во сколько раз перепад глубины весит больше перепада нормали — как у рендера режима A. */
const DEPTH_WEIGHT = 4;
/** Шаг точек сетки: меньше ячейки, чтобы в каждую попала хотя бы одна. */
const GRID_SPACING = 0.7;

/**
 * Образцы для квантайзера по точкам: `source[i]` — номер точки в ячейке `i` или −1, пусто.
 * Яркость на мелкой сетке нужна контурам по яркости, у 3D их заменяет геометрия.
 */
function samplesOf(
  points: ScenePoints,
  source: Int32Array,
  width: number,
  height: number,
): CellSamples {
  const n = width * height;
  const color = new Float32Array(n * 3);
  const fine = new Float32Array(n);
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = source[i];
    if (p < 0) continue;
    color.set(points.color.subarray(p * 3, p * 3 + 3), i * 3);
    alpha[i] = 1;
    fine[i] = luminance(color[i * 3], color[i * 3 + 1], color[i * 3 + 2], LUMA_WEIGHTS.rec709);
  }
  return { width, height, color, alpha, sub: 1, fine };
}

/**
 * Закрытое спереди отбрасывается: у каждой клетки экрана со стороной `cell` своя ближняя
 * глубина, и точка дальше неё больше чем на клетку в мире не видна. Изнанку замкнутых тел
 * отсекает сама выборка, здесь — тела друг за другом и тор сам за собой.
 */
function visiblePoints(
  points: ScenePoints,
  width: number,
  height: number,
  cell: number,
  unit: (depth: number) => number,
): number[] {
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const nearest = new Float32Array(gw * gh).fill(Infinity);
  const slot = (i: number): number =>
    Math.min(gh - 1, Math.floor(points.y[i] / cell)) * gw +
    Math.min(gw - 1, Math.floor(points.x[i] / cell));
  for (let i = 0; i < points.count; i++) {
    const s = slot(i);
    if (points.depth[i] < nearest[s]) nearest[s] = points.depth[i];
  }
  const kept: number[] = [];
  for (let i = 0; i < points.count; i++) {
    const depth = points.depth[i];
    if (depth <= nearest[slot(i)] + (1.5 * cell) / unit(depth)) kept.push(i);
  }
  return kept;
}

/**
 * Облако символов: у каждого своё место и размер, от дальних к ближним — ближние рисуются
 * поверх. Дизеринга нет: у символа облака нет своей клетки.
 */
export function cloudSprites(
  scene: Scene3D,
  width: number,
  height: number,
  meshes: readonly Mesh3D[],
): Sprite3D[] {
  const { render, camera } = scene;
  const world = render.sizeByDepth && camera.projection === 'perspective';
  const points = scenePoints(scene, width, height, meshes, {
    spacing: render.spacing,
    world,
    nearEdge: false,
  });
  const view = viewOf(camera, width, height);
  const kept = visiblePoints(points, width, height, Math.max(1, 2 * render.spacing), (depth) =>
    cellsPerUnit(view, depth),
  );
  kept.sort((a, b) => points.depth[b] - points.depth[a]);
  const order = kept.slice(Math.max(0, kept.length - MAX_SPRITES));
  const options: QuantizeOptions = { ...scene.quantize, edges: false, dither: 'none' };
  const cells = quantize(samplesOf(points, Int32Array.from(order), order.length, 1), options);
  const sprites: Sprite3D[] = [];
  order.forEach((i, k) => {
    const cell = cells.get(keyOf(k, 0));
    if (!cell) return;
    const body = scene.nodes[points.body[i]].id;
    sprites.push({ x: points.x[i], y: points.y[i], size: points.size[i], cell, body });
  });
  return sprites;
}

/**
 * В каждой ячейке — номер ближней точки, −1 — пусто. Точка редкой выборки (`size` больше двух
 * ячеек: тело огромно, бюджет точек огрубил его) закрывает квадрат ячеек вокруг себя.
 */
function nearestPoints(points: ScenePoints, width: number, height: number): Int32Array {
  const nearest = new Int32Array(width * height).fill(-1);
  const put = (x: number, y: number, i: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const cell = y * width + x;
    const known = nearest[cell];
    if (known < 0 || points.depth[i] < points.depth[known]) nearest[cell] = i;
  };
  for (let i = 0; i < points.count; i++) {
    const x = Math.floor(points.x[i]);
    const y = Math.floor(points.y[i]);
    const reach = Math.floor(points.size[i] / 2);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) put(x + dx, y + dy, i);
    }
  }
  return nearest;
}

/**
 * Дыры внутри тела: пустая ячейка, у которой заняты три соседа из четырёх, берёт ближнего из
 * них. Точки ложатся не ровной сеткой, и без этого по телу шла бы редкая рябь пустот.
 */
function fillHoles(
  nearest: Int32Array,
  points: ScenePoints,
  width: number,
  height: number,
): Int32Array {
  const out = nearest.slice();
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (nearest[i] >= 0) continue;
      let best = -1;
      let filled = 0;
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        const p = nearest[j];
        if (p < 0) continue;
        filled++;
        if (best < 0 || points.depth[p] < points.depth[best]) best = p;
      }
      if (filled >= 3) out[i] = best;
    }
  }
  return out;
}

/**
 * Символы по сетке экрана: в каждой ячейке — ближняя точка поверхности, как пиксель при
 * растеризации. Контуры — по глубине и нормалям этих точек, как у режима A, только по ячейкам.
 */
export function gridCells(
  scene: Scene3D,
  width: number,
  height: number,
  meshes: readonly Mesh3D[],
): CellGrid {
  const points = scenePoints(scene, width, height, meshes, {
    spacing: GRID_SPACING,
    world: false,
    nearEdge: true,
  });
  const source = fillHoles(nearestPoints(points, width, height), points, width, height);
  // Глубина в долях дальней границы сцены, как у буфера режима A: контуры той же толщины.
  const { far } = sceneReach(scene, meshes);
  const depth = new Float32Array(width * height).fill(DEPTH_WEIGHT);
  const normal = new Float32Array(width * height * 3);
  source.forEach((p, i) => {
    if (p < 0) return;
    depth[i] = Math.min(1, points.depth[p] / far) * DEPTH_WEIGHT;
    normal.set(points.normal.subarray(p * 3, p * 3 + 3), i * 3);
  });
  const samples = samplesOf(points, source, width, height);
  return quantize({ ...samples, geometry: { depth, normal } }, scene.quantize);
}
