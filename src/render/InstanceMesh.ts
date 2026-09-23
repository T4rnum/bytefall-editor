import * as THREE from 'three';
import { type GlyphBatch, INSTANCE, INSTANCE_FLOATS } from '../core/instances';
import { type GlyphSource, createGlyphMaterial, createQuadGeometry } from './glyphShader';

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 aCenter;
  attribute vec3 aPose;
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
    // Квадрат символа вокруг его центра: масштаб, затем поворот (aPose.x, радианы). Ось Y
    // документа смотрит вниз, поэтому положительный угол поворачивает по часовой стрелке.
    vec2 local = (position.xy - 0.5) * aPose.yz;
    float c = cos(aPose.x);
    float s = sin(aPose.x);
    vec2 doc = aCenter + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(doc.x, -doc.y, 0.0, 1.0);
  }
`;

const MIN_CAPACITY = 64;

interface Attributes {
  readonly center: THREE.InstancedBufferAttribute;
  readonly pose: THREE.InstancedBufferAttribute;
  readonly uv: THREE.InstancedBufferAttribute;
  readonly fg: THREE.InstancedBufferAttribute;
  readonly bg: THREE.InstancedBufferAttribute;
}

/**
 * Свободные символы одним инстансированным вызовом: у каждого свой центр, поворот и масштаб.
 *
 * В отличие от сетки, инстансов ровно столько, сколько символов, и заливаются они целиком: поток
 * собирается заново на каждый кадр, а символов в нём на порядки меньше, чем ячеек холста.
 * Порядок инстансов — порядок отрисовки: так правленый символ ложится поверх соседей.
 */
export class InstanceMesh {
  readonly mesh: THREE.Mesh;
  private geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private attrs: Attributes | null = null;
  private capacity = 0;
  private batch: GlyphBatch | null = null;
  private atlasVersion = -1;

  constructor(private readonly atlas: GlyphSource) {
    this.geometry = createQuadGeometry();
    this.material = createGlyphMaterial(atlas, VERTEX_SHADER);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.geometry.instanceCount = 0;
  }

  update(batch: GlyphBatch): void {
    this.batch = batch;
    if (batch.count > this.capacity) this.grow(batch.count);
    const attrs = this.attrs;
    if (!attrs) return;
    // Прямоугольник атласа ищется один раз на символ таблицы, а не на каждый инстанс.
    const rects = batch.glyphs.map((glyph) => this.atlas.getRect(glyph));
    const center = attrs.center.array as Float32Array;
    const pose = attrs.pose.array as Float32Array;
    const uv = attrs.uv.array as Float32Array;
    const fg = attrs.fg.array as Float32Array;
    const bg = attrs.bg.array as Float32Array;
    const d = batch.data;
    for (let i = 0; i < batch.count; i++) {
      const o = i * INSTANCE_FLOATS;
      center[i * 2] = d[o + INSTANCE.x];
      center[i * 2 + 1] = d[o + INSTANCE.y];
      pose[i * 3] = d[o + INSTANCE.rot];
      pose[i * 3 + 1] = d[o + INSTANCE.sx];
      pose[i * 3 + 2] = d[o + INSTANCE.sy];
      const rect = rects[d[o + INSTANCE.glyph]];
      uv[i * 4] = rect.u0;
      uv[i * 4 + 1] = rect.v0;
      uv[i * 4 + 2] = rect.u1;
      uv[i * 4 + 3] = rect.v1;
      for (let c = 0; c < 4; c++) {
        fg[i * 4 + c] = d[o + INSTANCE.fg + c];
        bg[i * 4 + c] = d[o + INSTANCE.bg + c];
      }
    }
    for (const attr of Object.values(attrs) as THREE.InstancedBufferAttribute[]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, batch.count * attr.itemSize);
      attr.needsUpdate = true;
    }
    this.geometry.instanceCount = batch.count;
    this.atlasVersion = this.atlas.version;
  }

  /** После роста атласа старые UV недействительны: поток надо перезалить. */
  needsRefresh(): boolean {
    return this.batch !== null && this.atlasVersion !== this.atlas.version;
  }

  refresh(): void {
    if (this.batch) this.update(this.batch);
  }

  /**
   * Места с запасом вдвое: поток растёт на каждом жесте, и пересоздавать геометрию на каждый
   * новый символ было бы дорого. Старая геометрия освобождается целиком, вместе с GPU-буферами.
   */
  private grow(count: number): void {
    let capacity = Math.max(MIN_CAPACITY, this.capacity);
    while (capacity < count) capacity *= 2;
    const make = (size: number): THREE.InstancedBufferAttribute => {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      attr.setUsage(THREE.DynamicDrawUsage);
      return attr;
    };
    const attrs: Attributes = {
      center: make(2),
      pose: make(3),
      uv: make(4),
      fg: make(4),
      bg: make(4),
    };
    const geometry = createQuadGeometry();
    geometry.setAttribute('aCenter', attrs.center);
    geometry.setAttribute('aPose', attrs.pose);
    geometry.setAttribute('aUvRect', attrs.uv);
    geometry.setAttribute('aFg', attrs.fg);
    geometry.setAttribute('aBg', attrs.bg);
    this.geometry.dispose();
    this.geometry = geometry;
    this.mesh.geometry = geometry;
    this.attrs = attrs;
    this.capacity = capacity;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
