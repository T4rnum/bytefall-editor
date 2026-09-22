import * as THREE from 'three';

/** Два тёмных тона: подложка должна читаться как «здесь пусто», а не спорить с рисунком. */
export const CHECKER_LIGHT = '#2a2a31';
export const CHECKER_DARK = '#1f1f25';

/**
 * Ниже этого размера клетки на экране шахматка превращается в рябь, особенно при панорамировании.
 * Тогда подложка плавно сходит в ровный средний тон.
 */
const FADE_FROM_PX = 6;
const FADE_TO_PX = 3;

const VERTEX = /* glsl */ `
varying vec2 vCell;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vCell = vec2(world.x, -world.y);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * Клетка шахматки — ровно одна ячейка документа. Мельче нельзя: символ лёг бы на четыре
 * разных тона и хуже читался. Крупнее незачем: вопрос «эта ячейка прозрачна?» задаётся про
 * ячейку, и ответ на него должен быть виден у каждой.
 */
const FRAGMENT = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uDark;
uniform float uFade;
varying vec2 vCell;
void main() {
  vec2 cell = floor(vCell);
  float odd = mod(cell.x + cell.y, 2.0);
  vec3 color = mix(uDark, uLight, odd);
  gl_FragColor = vec4(mix(color, (uDark + uLight) * 0.5, uFade), 1.0);
}
`;

export interface Checker {
  readonly mesh: THREE.Mesh;
  setSize(width: number, height: number): void;
  setZoom(zoom: number): void;
  dispose(): void;
}

/** Подложка прозрачного холста: видно, где у ячеек нет фона. В экспорт не попадает. */
export function createChecker(): Checker {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0.5, -0.5, 0);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uLight: { value: new THREE.Color(CHECKER_LIGHT) },
      uDark: { value: new THREE.Color(CHECKER_DARK) },
      uFade: { value: 0 },
    },
  });
  material.depthTest = false;
  const mesh = new THREE.Mesh(geometry, material);
  // Под ячейками, как и сплошной фон холста: оба никогда не видны одновременно.
  mesh.renderOrder = 0;

  return {
    mesh,
    setSize(width, height) {
      mesh.scale.set(width, height, 1);
    },
    setZoom(zoom) {
      const fade = (FADE_FROM_PX - zoom) / (FADE_FROM_PX - FADE_TO_PX);
      material.uniforms.uFade.value = Math.min(1, Math.max(0, fade));
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
