import * as THREE from 'three';
import type { Point } from '../core/geometry';

/**
 * Отрезки служебной графики в координатах документа: рамки выбранных объектов, рамки выделенных
 * символов, сетка объекта в режиме правки. Точки идут парами — начало и конец отрезка. Буфер
 * растёт удвоением и не пересоздаётся, пока отрезки в него влезают.
 */
export interface LineMarks {
  readonly mesh: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  /** Пусто — ничего не рисуется, и `visible` ставит тот, кто владеет слоем. */
  set(points: readonly Point[]): boolean;
  dispose(): void;
}

/**
 * Точки документа в буфер вершин: буфер растёт удвоением, рисуется ровно столько, сколько точек.
 * true — точки есть и рисовать есть что.
 */
function writePoints(geometry: THREE.BufferGeometry, points: readonly Point[]): boolean {
  let position = geometry.getAttribute('position') as THREE.BufferAttribute;
  if (position.count < points.length) {
    const size = 2 ** Math.ceil(Math.log2(points.length));
    position = new THREE.BufferAttribute(new Float32Array(size * 3), 3);
    geometry.setAttribute('position', position);
  }
  // Мир смотрит осью Y вверх, документ — вниз.
  points.forEach((p, i) => position.setXYZ(i, p.x, -p.y, 0));
  position.needsUpdate = true;
  geometry.setDrawRange(0, points.length);
  return points.length > 0;
}

export function createLineMarks(color: string, opacity: number, renderOrder: number): LineMarks {
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  material.depthTest = false;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48), 3));
  const mesh = new THREE.LineSegments(geometry, material);
  // Вершины меняются на лету, и сфера отсечения, посчитанная однажды, устарела бы.
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return {
    mesh,
    set: (points) => writePoints(geometry, points),
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** Замкнутые многоугольники в пары точек для `LineMarks`. */
export function loopSegments(loops: readonly (readonly Point[])[]): Point[] {
  const out: Point[] = [];
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) out.push(loop[i], loop[(i + 1) % loop.length]);
  }
  return out;
}

/** Залитые четырёхугольники в координатах документа: подсветка выделенных символов. */
export interface QuadFill {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  set(quads: readonly (readonly Point[])[]): boolean;
  dispose(): void;
}

export function createQuadFill(color: string, opacity: number, renderOrder: number): QuadFill {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  material.depthTest = false;
  material.side = THREE.DoubleSide;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return {
    mesh,
    // Два треугольника на четырёхугольник: 0-1-2 и 0-2-3.
    set: (quads) =>
      writePoints(
        geometry,
        quads.flatMap((q) => [q[0], q[1], q[2], q[0], q[2], q[3]]),
      ),
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
