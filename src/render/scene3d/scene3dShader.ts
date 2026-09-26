import * as THREE from 'three';

/**
 * Шейдер тел 3D-сцены. Один материал на два прохода: `uGeometry` = 0 — цвет с рассеянным светом и
 * солнцем по Ламберту, 1 — нормаль в координатах камеры и линейная глубина для контуров. Свет
 * без деления на π, как в документе: сила 1 — полный цвет поверхности.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uNear;
  uniform float uFar;
  #ifdef USE_VERTEX_COLOR
    attribute vec3 color;
  #endif
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vDepth = (-view.z - uNear) / (uFar - uNear);
    #ifdef USE_VERTEX_COLOR
      vColor = color;
    #else
      vColor = vec3(1.0);
    #endif
    #ifdef USE_TEXTURE
      vUv = uv;
    #else
      vUv = vec2(0.0);
    #endif
    gl_Position = projectionMatrix * view;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uGeometry;
  uniform vec3 uColor;
  uniform vec3 uAmbient;
  uniform vec3 uSun;
  /** Направление на солнце в координатах камеры. */
  uniform vec3 uSunDir;
  #ifdef USE_TEXTURE
    uniform sampler2D uMap;
  #endif
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec2 vUv;
  varying float vDepth;

  void main() {
    vec3 n = normalize(vNormal);
    // Изнанка плоскости смотрит на камеру своей стороной.
    if (!gl_FrontFacing) n = -n;
    if (uGeometry > 0.5) {
      gl_FragColor = vec4(n, clamp(vDepth, 0.0, 1.0));
      return;
    }
    vec3 base = uColor * vColor;
    #ifdef USE_TEXTURE
      base *= texture2D(uMap, vUv).rgb;
    #endif
    vec3 light = uAmbient + uSun * max(dot(n, uSunDir), 0.0);
    gl_FragColor = vec4(base * light, 1.0);
  }
`;

export interface BodyMaterialOptions {
  readonly vertexColors: boolean;
  readonly texture: THREE.Texture | null;
}

/** Униформы тела с типами: у `ShaderMaterial.uniforms` их нет. Объекты те же, что у материала. */
export interface BodyUniforms {
  readonly uGeometry: { value: number };
  readonly uColor: { value: THREE.Color };
  readonly uAmbient: { value: THREE.Color };
  readonly uSun: { value: THREE.Color };
  readonly uSunDir: { value: THREE.Vector3 };
  readonly uNear: { value: number };
  readonly uFar: { value: number };
  readonly uMap: { value: THREE.Texture | null };
}

export interface BodyMaterial {
  readonly material: THREE.ShaderMaterial;
  readonly uniforms: BodyUniforms;
}

export function createBodyMaterial({ vertexColors, texture }: BodyMaterialOptions): BodyMaterial {
  const defines: Record<string, string> = {};
  if (vertexColors) defines.USE_VERTEX_COLOR = '';
  if (texture) defines.USE_TEXTURE = '';
  const uniforms: BodyUniforms = {
    uGeometry: { value: 0 },
    uColor: { value: new THREE.Color() },
    uAmbient: { value: new THREE.Color() },
    uSun: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 0, 1) },
    uNear: { value: 0.05 },
    uFar: { value: 100 },
    uMap: { value: texture },
  };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    defines,
    side: THREE.DoubleSide,
  });
  return { material, uniforms };
}
