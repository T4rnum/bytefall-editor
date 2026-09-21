import * as THREE from 'three';
import type { CellBuffer } from '../core/compositor';
import type { GlyphAtlas } from './font/GlyphAtlas';

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 aCell;
  attribute vec4 aUvRect;
  attribute vec4 aFg;
  attribute vec4 aBg;
  varying vec2 vUv;
  varying vec4 vFg;
  varying vec4 vBg;

  void main() {
    vUv = mix(aUvRect.xy, aUvRect.zw, uv);
    vFg = aFg;
    vBg = aBg;
    // Ячейка (x, y) занимает [x, x+1] по X и [-y-1, -y] по Y: ось Y документа смотрит вниз.
    vec3 world = vec3(aCell.x + position.x, -aCell.y - position.y, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

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
function createQuadGeometry(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 2, 1, 0, 3, 2]);
  return geometry;
}

/** Вся сетка одним инстансированным вызовом: по инстансу на ячейку, пустые отбрасываются в шейдере. */
export class GridMesh {
  readonly mesh: THREE.Mesh;
  private geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private uvAttr: THREE.InstancedBufferAttribute | null = null;
  private fgAttr: THREE.InstancedBufferAttribute | null = null;
  private bgAttr: THREE.InstancedBufferAttribute | null = null;
  private width = 0;
  private height = 0;
  private atlasVersion = -1;

  constructor(private readonly atlas: GlyphAtlas) {
    this.geometry = createQuadGeometry();
    this.material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas.texture } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.geometry.instanceCount = 0;
  }

  update(buffer: CellBuffer): void {
    if (buffer.width !== this.width || buffer.height !== this.height) {
      this.rebuild(buffer.width, buffer.height);
    }
    const uv = this.uvAttr as THREE.InstancedBufferAttribute;
    const fg = this.fgAttr as THREE.InstancedBufferAttribute;
    const bg = this.bgAttr as THREE.InstancedBufferAttribute;
    const uvArray = uv.array as Float32Array;
    const count = buffer.width * buffer.height;
    for (let i = 0; i < count; i++) {
      const rect = this.atlas.getRect(buffer.glyphs[i]);
      const o = i * 4;
      uvArray[o] = rect.u0;
      uvArray[o + 1] = rect.v0;
      uvArray[o + 2] = rect.u1;
      uvArray[o + 3] = rect.v1;
    }
    (fg.array as Float32Array).set(buffer.fg);
    (bg.array as Float32Array).set(buffer.bg);
    uv.needsUpdate = true;
    fg.needsUpdate = true;
    bg.needsUpdate = true;
    this.atlasVersion = this.atlas.version;
  }

  /** После роста атласа старые UV недействительны: буфер нужно перезалить. */
  needsRefresh(): boolean {
    return this.atlasVersion !== this.atlas.version;
  }

  /**
   * Новый размер означает новую геометрию целиком: замена атрибутов на живой геометрии
   * оставила бы старые GPU-буферы без освобождения, а dispose геометрии чистит всё разом.
   */
  private rebuild(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const count = width * height;
    const cells = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      cells[i * 2] = i % width;
      cells[i * 2 + 1] = Math.floor(i / width);
    }
    this.uvAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    this.fgAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    this.bgAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    for (const attr of [this.uvAttr, this.fgAttr, this.bgAttr]) {
      attr.setUsage(THREE.DynamicDrawUsage);
    }
    const geometry = createQuadGeometry();
    geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    geometry.setAttribute('aUvRect', this.uvAttr);
    geometry.setAttribute('aFg', this.fgAttr);
    geometry.setAttribute('aBg', this.bgAttr);
    geometry.instanceCount = count;
    this.geometry.dispose();
    this.geometry = geometry;
    this.mesh.geometry = geometry;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
