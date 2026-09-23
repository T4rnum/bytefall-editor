import * as THREE from 'three';
import type { Point } from '../core/geometry';
import { type Checker, createChecker } from './checker';
import { type GizmoLayer, type GizmoMarks, createGizmoLayer } from './gizmo';
import { RENDER_ORDER } from './order';
import { type Selection, type SelectionLayer, createSelectionLayer } from './selectionMask';

export const ACCENT_COLOR = '#ffb347';
export const OBJECT_COLOR = '#4fd1ff';
/** Заливка ручек гизмо: тёмная, чтобы ручка читалась и на светлом, и на тёмном рисунке. */
const HANDLE_FILL_COLOR = '#101418';

type Plane = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
type Outline = THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>;
type Lines = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

function lineMaterial(color: string, opacity: number): THREE.LineBasicMaterial {
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  material.depthTest = false;
  return material;
}

function planeMaterial(color: string, opacity: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
  material.depthTest = false;
  return material;
}

/** Единичный квадрат с началом в левом верхнем углу ячейки: мир по Y растёт вверх. */
function unitPlane(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0.5, -0.5, 0);
  return geometry;
}

function unitOutline(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, -1, 0, 0, -1, 0]), 3),
  );
  return geometry;
}

/** Четыре вершины рамки объекта: их координаты задаются каждый раз заново. */
function quadOutline(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  return geometry;
}

function disposeObject(obj: Plane | Outline | Lines): void {
  obj.geometry.dispose();
  obj.material.dispose();
}

/** Служебная графика поверх сетки: фон холста, подложка, линии сетки, курсор, выделение. */
export class Overlay {
  readonly group = new THREE.Group();
  private readonly background: Plane;
  private readonly checker: Checker;
  private readonly cursor: Outline;
  private readonly selection: SelectionLayer;
  private readonly objectOutline: Outline;
  private readonly gizmo: GizmoLayer;
  private gridLines: Lines | null = null;
  private width = 0;
  private height = 0;
  private showGrid = true;
  private showChecker = true;
  /** У холста нет фона: под ячейками либо шахматка, либо цвет рабочей области. */
  private transparent = false;
  private chromeVisible = true;
  private cursorCell: Point | null = null;
  private hasSelection = false;
  private hasObject = false;
  private hasGizmo = false;

  constructor() {
    this.background = new THREE.Mesh(unitPlane(), planeMaterial('#000000', 1));
    this.background.renderOrder = RENDER_ORDER.backdrop;
    this.checker = createChecker();
    this.selection = createSelectionLayer(ACCENT_COLOR);
    this.objectOutline = new THREE.LineLoop(quadOutline(), lineMaterial(OBJECT_COLOR, 1));
    this.objectOutline.renderOrder = RENDER_ORDER.marks;
    // Вершины рамки меняются на лету, и сфера отсечения, посчитанная однажды, устарела бы.
    this.objectOutline.frustumCulled = false;
    this.cursor = new THREE.LineLoop(unitOutline(), lineMaterial('#ffffff', 0.9));
    this.cursor.renderOrder = RENDER_ORDER.cursor;
    this.gizmo = createGizmoLayer({
      color: OBJECT_COLOR,
      accent: ACCENT_COLOR,
      fill: HANDLE_FILL_COLOR,
    });
    this.group.add(
      this.background,
      this.checker.mesh,
      this.selection.mesh,
      this.objectOutline,
      this.gizmo.group,
      this.cursor,
    );
    this.setSelection(null);
    this.setCursor(null);
  }

  setDocument(width: number, height: number, background: string | null): void {
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.background.scale.set(width, height, 1);
      this.checker.setSize(width, height);
      this.selection.setSize(width, height);
      this.rebuildGrid();
    }
    this.background.visible = background !== null;
    if (background !== null) this.background.material.color.set(background);
    this.transparent = background === null;
    this.applyVisibility();
  }

  setShowChecker(show: boolean): void {
    this.showChecker = show;
    this.applyVisibility();
  }

  setShowGrid(show: boolean): void {
    this.showGrid = show;
    this.applyVisibility();
  }

  setCursor(cell: Point | null): void {
    this.cursorCell = cell;
    if (cell) this.cursor.position.set(cell.x, -cell.y, 0);
    this.applyVisibility();
  }

  setSelection(selection: Selection | null): void {
    this.hasSelection = this.selection.update(selection);
    this.applyVisibility();
  }

  /** Обводка выделения и рябь шахматки считаются в пикселях экрана, поэтому зависят от зума. */
  setZoom(zoom: number): void {
    this.selection.setZoom(zoom);
    this.checker.setZoom(zoom);
  }

  /** Рамка выбранного объекта: четыре угла в координатах документа, повёрнутая вместе с ним. */
  setObjectOutline(quad: readonly Point[] | null): void {
    this.hasObject = quad !== null && quad.length === 4;
    if (quad && this.hasObject) {
      const position = this.objectOutline.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      quad.forEach((p, i) => position.setXYZ(i, p.x, -p.y, 0));
      position.needsUpdate = true;
    }
    this.applyVisibility();
  }

  /** Ручки трансформа выбранного объекта. null — гизмо не показывается. */
  setGizmo(marks: GizmoMarks | null): void {
    this.hasGizmo = marks !== null;
    if (marks) this.gizmo.update(marks);
    this.applyVisibility();
  }

  /** Ручки гизмо задаются в пикселях экрана и пересчитываются под плотность экрана. */
  setPixelRatio(ratio: number): void {
    this.gizmo.setPixelRatio(ratio);
  }

  /** Скрывает служебную графику, например на время экспорта. */
  setChromeVisible(visible: boolean): void {
    this.chromeVisible = visible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const chrome = this.chromeVisible;
    // Шахматка — служебная графика: в экспорт прозрачный холст уходит прозрачным.
    this.checker.mesh.visible = chrome && this.showChecker && this.transparent;
    if (this.gridLines) this.gridLines.visible = chrome && this.showGrid;
    this.cursor.visible = chrome && this.cursorCell !== null;
    this.selection.mesh.visible = chrome && this.hasSelection;
    this.objectOutline.visible = chrome && this.hasObject;
    this.gizmo.group.visible = chrome && this.hasGizmo;
  }

  private rebuildGrid(): void {
    if (this.gridLines) {
      this.group.remove(this.gridLines);
      disposeObject(this.gridLines);
    }
    const { width: w, height: h } = this;
    const points: number[] = [];
    for (let x = 0; x <= w; x++) points.push(x, 0, 0, x, -h, 0);
    for (let y = 0; y <= h; y++) points.push(0, -y, 0, w, -y, 0);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    this.gridLines = new THREE.LineSegments(geometry, lineMaterial('#ffffff', 0.12));
    this.gridLines.renderOrder = RENDER_ORDER.gridLines;
    this.gridLines.visible = this.showGrid;
    this.group.add(this.gridLines);
  }

  dispose(): void {
    for (const obj of [this.background, this.objectOutline, this.cursor]) {
      disposeObject(obj);
    }
    this.selection.dispose();
    this.checker.dispose();
    this.gizmo.dispose();
    if (this.gridLines) disposeObject(this.gridLines);
  }
}
