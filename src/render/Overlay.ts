import * as THREE from 'three';
import type { Point, Rect } from '../core/geometry';
import { type Selection, type SelectionLayer, createSelectionLayer } from './selectionMask';

export const ACCENT_COLOR = '#ffb347';
export const OBJECT_COLOR = '#4fd1ff';

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

function disposeObject(obj: Plane | Outline | Lines): void {
  obj.geometry.dispose();
  obj.material.dispose();
}

/** Служебная графика поверх сетки: фон холста, линии сетки, курсор, выделение. */
export class Overlay {
  readonly group = new THREE.Group();
  private readonly background: Plane;
  private readonly cursor: Outline;
  private readonly selection: SelectionLayer;
  private readonly objectOutline: Outline;
  private gridLines: Lines | null = null;
  private width = 0;
  private height = 0;
  private showGrid = true;
  private chromeVisible = true;
  private cursorCell: Point | null = null;
  private hasSelection = false;
  private objectRect: Rect | null = null;

  constructor() {
    this.background = new THREE.Mesh(unitPlane(), planeMaterial('#000000', 1));
    this.background.renderOrder = 0;
    this.selection = createSelectionLayer(ACCENT_COLOR);
    this.objectOutline = new THREE.LineLoop(unitOutline(), lineMaterial(OBJECT_COLOR, 1));
    this.objectOutline.renderOrder = 3;
    this.cursor = new THREE.LineLoop(unitOutline(), lineMaterial('#ffffff', 0.9));
    this.cursor.renderOrder = 4;
    this.group.add(this.background, this.selection.mesh, this.objectOutline, this.cursor);
    this.setSelection(null);
    this.setCursor(null);
  }

  setDocument(width: number, height: number, background: string | null): void {
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.background.scale.set(width, height, 1);
      this.selection.setSize(width, height);
      this.rebuildGrid();
    }
    this.background.visible = background !== null;
    if (background !== null) this.background.material.color.set(background);
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

  /** Толщина обводки выделения задаётся в пикселях экрана, поэтому зависит от зума. */
  setZoom(zoom: number): void {
    this.selection.setZoom(zoom);
  }

  /** Рамка выбранного объекта в координатах документа. */
  setObjectOutline(rect: Rect | null): void {
    this.objectRect = rect && rect.w > 0 && rect.h > 0 ? rect : null;
    if (this.objectRect) {
      const { x, y, w, h } = this.objectRect;
      this.objectOutline.position.set(x, -y, 0);
      this.objectOutline.scale.set(w, h, 1);
    }
    this.applyVisibility();
  }

  /** Скрывает служебную графику, например на время экспорта. */
  setChromeVisible(visible: boolean): void {
    this.chromeVisible = visible;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const chrome = this.chromeVisible;
    if (this.gridLines) this.gridLines.visible = chrome && this.showGrid;
    this.cursor.visible = chrome && this.cursorCell !== null;
    this.selection.mesh.visible = chrome && this.hasSelection;
    this.objectOutline.visible = chrome && this.objectRect !== null;
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
    this.gridLines.renderOrder = 2;
    this.gridLines.visible = this.showGrid;
    this.group.add(this.gridLines);
  }

  dispose(): void {
    for (const obj of [this.background, this.objectOutline, this.cursor]) {
      disposeObject(obj);
    }
    this.selection.dispose();
    if (this.gridLines) disposeObject(this.gridLines);
  }
}
