import * as THREE from 'three';
import type { Selection } from '../core/selection';

export type { Selection };

const VERTEX = /* glsl */ `
varying vec2 vCell;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  // Мир по Y растёт вверх, документ — вниз.
  vCell = vec2(world.x, -world.y);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * Выделение — произвольный набор ячеек, поэтому рисуется маской, а не рамкой: одна плоскость на
 * весь холст, один текстурный выбор на фрагмент. Обводка получается сравнением с четырьмя
 * соседями, так что отдельная геометрия контура не нужна и не может с маской разойтись.
 */
const FRAGMENT = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uSize;
uniform vec3 uColor;
uniform float uFill;
uniform float uEdge;
varying vec2 vCell;

float maskAt(vec2 cell) {
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uSize.x || cell.y >= uSize.y) return 0.0;
  return texture2D(uMask, (floor(cell) + 0.5) / uSize).r;
}

void main() {
  if (maskAt(vCell) < 0.5) discard;
  vec2 f = fract(vCell);
  float d = 1.0;
  if (maskAt(vCell + vec2(-1.0, 0.0)) < 0.5) d = min(d, f.x);
  if (maskAt(vCell + vec2(1.0, 0.0)) < 0.5) d = min(d, 1.0 - f.x);
  if (maskAt(vCell + vec2(0.0, -1.0)) < 0.5) d = min(d, f.y);
  if (maskAt(vCell + vec2(0.0, 1.0)) < 0.5) d = min(d, 1.0 - f.y);
  gl_FragColor = vec4(uColor, mix(uFill, 1.0, step(d, uEdge)));
}
`;

/** Обводка в пикселях экрана: тоньше — и она пропадает, толще — и съедает мелкие ячейки. */
const EDGE_PIXELS = 1.5;
/** Дальше половины ячейки обводка смысла не имеет: она сомкнётся сама с собой. */
const MAX_EDGE = 0.5;

export interface SelectionLayer {
  readonly mesh: THREE.Mesh;
  setSize(width: number, height: number): void;
  /** Заливает маску. Возвращает, есть ли что показывать. */
  update(selection: Selection | null): boolean;
  setZoom(zoom: number): void;
  dispose(): void;
}

export function createSelectionLayer(color: string): SelectionLayer {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0.5, -0.5, 0);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    uniforms: {
      uMask: { value: null },
      uSize: { value: new THREE.Vector2(1, 1) },
      uColor: { value: new THREE.Color(color) },
      uFill: { value: 0.18 },
      uEdge: { value: EDGE_PIXELS / 16 },
    },
  });
  material.depthTest = false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  mesh.visible = false;

  let width = 0;
  let height = 0;
  let data: Uint8Array | null = null;
  let texture: THREE.DataTexture | null = null;

  return {
    mesh,
    setSize(nextWidth, nextHeight) {
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      texture?.dispose();
      if (width <= 0 || height <= 0) {
        data = null;
        texture = null;
        material.uniforms.uMask.value = null;
        mesh.visible = false;
        return;
      }
      data = new Uint8Array(width * height);
      texture = new THREE.DataTexture(data, width, height, THREE.RedFormat);
      // Строка маски короче четырёх байт выравнивалась бы по умолчанию и уезжала вбок.
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      material.uniforms.uMask.value = texture;
      (material.uniforms.uSize.value as THREE.Vector2).set(width, height);
      mesh.scale.set(width, height, 1);
    },
    update(selection) {
      // Маска выделения уже лежит байтами по холсту, поэтому переносится одним копированием.
      if (!data || !texture || !selection) return false;
      if (selection.width !== width || selection.height !== height) return false;
      data.set(selection.mask);
      texture.needsUpdate = true;
      return true;
    },
    setZoom(zoom) {
      material.uniforms.uEdge.value = Math.min(MAX_EDGE, EDGE_PIXELS / Math.max(1, zoom));
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture?.dispose();
    },
  };
}
