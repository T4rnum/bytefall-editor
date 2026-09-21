import * as THREE from 'three';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/** Постэффекты уровня пикселей: свечение и CRT-развёртка поверх готового кадра. */
export interface PostSettings {
  /** Сила свечения, 0 выключает. */
  readonly bloom: number;
  /** Заметность строк развёртки 0..1. */
  readonly scanlines: number;
  /** Затемнение краёв 0..1. */
  readonly vignette: number;
}

export const DEFAULT_POST: PostSettings = { bloom: 0, scanlines: 0, vignette: 0 };

export const hasPost = (post: PostSettings): boolean =>
  post.bloom > 0 || post.scanlines > 0 || post.vignette > 0;

const CRT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uScanlines: { value: 0 },
    uVignette: { value: 0 },
    uLines: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uScanlines;
    uniform float uVignette;
    uniform float uLines;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // Одна тёмная полоса на каждые две строки пикселей.
      float line = 0.5 + 0.5 * sin(vUv.y * uLines * 3.14159265);
      color.rgb *= 1.0 - uScanlines * 0.6 * (1.0 - line);
      vec2 d = vUv - 0.5;
      color.rgb *= 1.0 - uVignette * 2.0 * dot(d, d);
      gl_FragColor = color;
    }
  `,
};

export interface PostPasses {
  readonly bloom: UnrealBloomPass;
  readonly crt: ShaderPass;
  readonly all: readonly Pass[];
}

export function createPostPasses(width: number, height: number): PostPasses {
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0, 0.4, 0.2);
  const crt = new ShaderPass(CRT_SHADER);
  return { bloom, crt, all: [bloom, crt] };
}

/** Переносит настройки в проходы; pixelHeight нужен для частоты строк развёртки. */
export function applyPostSettings(
  passes: PostPasses,
  post: PostSettings,
  pixelHeight: number,
): void {
  passes.bloom.strength = post.bloom;
  passes.bloom.enabled = post.bloom > 0;
  const uniforms = passes.crt.uniforms;
  uniforms.uScanlines.value = post.scanlines;
  uniforms.uVignette.value = post.vignette;
  uniforms.uLines.value = Math.max(1, pixelHeight);
  passes.crt.enabled = post.scanlines > 0 || post.vignette > 0;
}
