import * as THREE from 'three';
import type { Point } from '../core/geometry';
import { ringTexture } from './gizmo';
import { RENDER_ORDER } from './order';

/** Риг в координатах документа: отрезки парами точек и кольца, выбранный узел — отдельно. */
export interface RigMarks {
  readonly lines: readonly Point[];
  readonly selectedLines: readonly Point[];
  readonly rings: readonly Point[];
  readonly selectedRings: readonly Point[];
}

export interface RigLayer {
  /** Видимостью группы распоряжается Overlay: риг — служебная графика и в экспорт не идёт. */
  readonly group: THREE.Group;
  update(marks: RigMarks): void;
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

const RING_PX = 9;

type Drawable =
  | THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>
  | THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

/** Ставит точки; буфер растёт, если точек больше, чем в него влезает. */
function place(mesh: Drawable, at: readonly Point[]): void {
  let position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  if (position.count < at.length) {
    const size = Math.max(16, 2 ** Math.ceil(Math.log2(at.length)));
    position = new THREE.BufferAttribute(new Float32Array(size * 3), 3);
    mesh.geometry.setAttribute('position', position);
  }
  at.forEach((p, i) => position.setXYZ(i, p.x, -p.y, 0));
  position.needsUpdate = true;
  mesh.geometry.setDrawRange(0, at.length);
}

function geometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48), 3));
  return g;
}

function lines(color: string): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const material = new THREE.LineBasicMaterial({ color });
  material.depthTest = false;
  const mesh = new THREE.LineSegments(geometry(), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.marks;
  return mesh;
}

function rings(
  color: string,
  map: THREE.Texture,
): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const material = new THREE.PointsMaterial({ color, sizeAttenuation: false, map });
  material.depthTest = false;
  material.alphaTest = 0.5;
  material.transparent = true;
  const mesh = new THREE.Points(geometry(), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.marks;
  return mesh;
}

/**
 * Кости и контроллеры рига поверх рисунка. Кость — ромб от сустава к концу, контроллер —
 * перекрестье; суставы и контроллеры отмечены кольцами. Выбранный узел рисуется акцентом.
 */
export function createRigLayer(colors: {
  readonly color: string;
  readonly accent: string;
}): RigLayer {
  const group = new THREE.Group();
  const ring = ringTexture(32, 7);
  const meshes = {
    lines: lines(colors.color),
    selectedLines: lines(colors.accent),
    rings: rings(colors.color, ring),
    selectedRings: rings(colors.accent, ring),
  };
  group.add(meshes.lines, meshes.rings, meshes.selectedLines, meshes.selectedRings);
  const setPixelRatio = (ratio: number): void => {
    meshes.rings.material.size = RING_PX * ratio;
    meshes.selectedRings.material.size = RING_PX * ratio;
  };
  setPixelRatio(1);
  return {
    group,
    setPixelRatio,
    update(marks) {
      place(meshes.lines, marks.lines);
      place(meshes.selectedLines, marks.selectedLines);
      place(meshes.rings, marks.rings);
      place(meshes.selectedRings, marks.selectedRings);
    },
    dispose() {
      for (const mesh of Object.values(meshes)) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      ring.dispose();
    },
  };
}
