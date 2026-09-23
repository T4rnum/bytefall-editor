import * as THREE from 'three';
import type { GlyphRect } from './font/GlyphAtlas';

/**
 * То, что меши берут у атласа. Отдельный интерфейс, а не сам класс: атлас растеризует глифы через
 * Canvas2D, и без этой границы раскладку инстансов нельзя было бы проверить тестами вне браузера.
 */
export interface GlyphSource {
  readonly texture: THREE.Texture;
  readonly version: number;
  getRect(glyph: string): GlyphRect;
}

/**
 * Символ и фон одной ячейки. Глиф берётся из атласа бинарно, по порогу покрытия: пиксельный
 * шрифт не размывается ни в сетке, ни повёрнутым.
 */
const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec4 vFg;
  varying vec4 vBg;

  void main() {
    float coverage = step(0.5, texture2D(uAtlas, vUv).a);
    float glyphAlpha = coverage * vFg.a;
    float outAlpha = glyphAlpha + vBg.a * (1.0 - glyphAlpha);
    if (outAlpha <= 0.002) discard;
    vec3 rgb = (vFg.rgb * glyphAlpha + vBg.rgb * vBg.a * (1.0 - glyphAlpha)) / outAlpha;
    gl_FragColor = vec4(rgb, outAlpha);
  }
`;

/** Единичный квадрат: position.y растёт вниз по ячейке, uv совпадает с position. */
export function createQuadGeometry(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  return geometry;
}

/** Материал символа с заданным вершинным шейдером: где стоит квадрат, решает меш. */
export function createGlyphMaterial(
  atlas: GlyphSource,
  vertexShader: string,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas.texture } },
    vertexShader,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}
