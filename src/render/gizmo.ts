import * as THREE from 'three';
import type { Point } from '../core/geometry';
import { RENDER_ORDER } from './order';

/**
 * Что рисует гизмо: ручки масштаба (до восьми), ручка поворота на стебле и опорная точка.
 * Всё в координатах документа.
 */
export interface GizmoMarks {
  readonly handles: readonly Point[];
  readonly stem: Point;
  readonly knob: Point;
  readonly pivot: Point;
}

export interface GizmoLayer {
  /** Видимостью группы распоряжается Overlay: гизмо — служебная графика и в экспорт не идёт. */
  readonly group: THREE.Group;
  update(marks: GizmoMarks): void;
  /** Ручки задаются в пикселях экрана, а точки WebGL считаются в пикселях буфера. */
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

const HANDLE_PX = 7;
const KNOB_PX = 11;
const PIVOT_PX = 13;

/** Кольцо в маленькой текстуре: точка с ней рисуется кружком, а не квадратом. */
function ringTexture(size: number, thickness: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      const inside = d <= r && d >= r - thickness;
      data.set([255, 255, 255, inside ? 255 : 0], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

type Dots = THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

function points(count: number, material: THREE.PointsMaterial): Dots {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mesh = new THREE.Points(geometry, material);
  // Вершины меняются на лету: сфера отсечения, посчитанная однажды, устарела бы.
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER.marks;
  return mesh;
}

function pointMaterial(color: string, map?: THREE.Texture): THREE.PointsMaterial {
  const material = new THREE.PointsMaterial({ color, sizeAttenuation: false });
  material.depthTest = false;
  if (map) {
    material.map = map;
    material.alphaTest = 0.5;
    material.transparent = true;
  }
  return material;
}

/** Ставит точки; лишние вершины не рисуются: боковых ручек у маленького объекта нет. */
function place(mesh: Dots | THREE.LineSegments, at: readonly Point[]): void {
  const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  at.forEach((p, i) => position.setXYZ(i, p.x, -p.y, 0));
  position.needsUpdate = true;
  mesh.geometry.setDrawRange(0, at.length);
}

/**
 * Гизмо трансформа выбранного объекта. Рамку рисует сам Overlay, здесь — то, за что тянут:
 * восемь квадратных ручек масштаба, кружок поворота над рамкой и кольцо опорной точки.
 */
export function createGizmoLayer(colors: {
  readonly color: string;
  readonly accent: string;
  readonly fill: string;
}): GizmoLayer {
  const { color, accent, fill } = colors;
  const group = new THREE.Group();
  const ring = ringTexture(32, 7);
  const handleBorder = points(8, pointMaterial(color));
  const handleFill = points(8, pointMaterial(fill));
  const knob = points(1, pointMaterial(color, ring));
  const pivot = points(1, pointMaterial(accent, ring));
  const stemMaterial = new THREE.LineBasicMaterial({ color });
  stemMaterial.depthTest = false;
  const stemGeometry = new THREE.BufferGeometry();
  stemGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const stem = new THREE.LineSegments(stemGeometry, stemMaterial);
  stem.frustumCulled = false;
  stem.renderOrder = RENDER_ORDER.marks;
  // Заливка ручки поверх её рамки: так ручка читается на любом фоне.
  handleFill.renderOrder = RENDER_ORDER.marks + 0.5;
  group.add(stem, handleBorder, handleFill, knob, pivot);

  const setPixelRatio = (ratio: number): void => {
    handleBorder.material.size = (HANDLE_PX + 2) * ratio;
    handleFill.material.size = HANDLE_PX * ratio;
    knob.material.size = KNOB_PX * ratio;
    pivot.material.size = PIVOT_PX * ratio;
  };
  setPixelRatio(1);

  return {
    group,
    setPixelRatio,
    update(marks) {
      place(handleBorder, marks.handles);
      place(handleFill, marks.handles);
      place(knob, [marks.knob]);
      place(pivot, [marks.pivot]);
      place(stem, [marks.stem, marks.knob]);
    },
    dispose() {
      for (const mesh of [handleBorder, handleFill, knob, pivot]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      stemGeometry.dispose();
      stemMaterial.dispose();
      ring.dispose();
    },
  };
}
