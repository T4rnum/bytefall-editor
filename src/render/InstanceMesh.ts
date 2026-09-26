import * as THREE from 'three';
import { type GlyphBatch, INSTANCE, INSTANCE_FLOATS } from '../core/instances';
import { MATERIAL } from '../core/material';
import { type GlyphSource, createQuadGeometry } from './glyphShader';
import { createInstanceMaterial } from './instanceShader';

const MIN_CAPACITY = 64;

interface Attributes {
  readonly center: THREE.InstancedBufferAttribute;
  readonly pose: THREE.InstancedBufferAttribute;
  readonly uv: THREE.InstancedBufferAttribute;
  readonly fg: THREE.InstancedBufferAttribute;
  readonly bg: THREE.InstancedBufferAttribute;
  readonly outline: THREE.InstancedBufferAttribute;
  readonly glow: THREE.InstancedBufferAttribute;
  readonly glowStrength: THREE.InstancedBufferAttribute;
  readonly shine: THREE.InstancedBufferAttribute;
  readonly shineMotion: THREE.InstancedBufferAttribute;
  readonly extra: THREE.InstancedBufferAttribute;
}

/** Имена атрибутов в шейдере, см. `instanceShader.ts`. */
const NAMES: Readonly<Record<keyof Attributes, string>> = {
  center: 'aCenter',
  pose: 'aPose',
  uv: 'aUvRect',
  fg: 'aFg',
  bg: 'aBg',
  outline: 'aOutline',
  glow: 'aGlow',
  glowStrength: 'aGlowStrength',
  shine: 'aShine',
  shineMotion: 'aShineMotion',
  extra: 'aExtra',
};

const SIZES: Readonly<Record<keyof Attributes, number>> = {
  center: 2,
  pose: 3,
  uv: 4,
  fg: 4,
  bg: 4,
  outline: 4,
  glow: 4,
  glowStrength: 1,
  shine: 4,
  shineMotion: 4,
  extra: 3,
};

/**
 * Числа подряд из потока в атрибут. Цикл, а не `set(subarray())`: вид на каждый атрибут каждого
 * символа — лишний объект в кадре, а поток заливается на каждый кадр.
 */
function copy(to: Float32Array, at: number, from: Float32Array, start: number, n: number): void {
  for (let k = 0; k < n; k++) to[at + k] = from[start + k];
}

/**
 * Свободные символы одним инстансированным вызовом: у каждого свой центр, поворот и масштаб.
 *
 * В отличие от сетки, инстансов ровно столько, сколько символов, и заливаются они целиком: поток
 * собирается заново на каждый кадр, а символов в нём на порядки меньше, чем ячеек холста.
 * Порядок инстансов — порядок отрисовки: так правленый символ ложится поверх соседей.
 *
 * Мешей два на одной геометрии: подложка с контуром и свечением материала и сами символы над
 * ней. Подложка рисуется, только если в потоке есть символ с материалом.
 */
export class InstanceMesh {
  /** Все меши потока: подложка и символы. */
  readonly object = new THREE.Group();
  /** Сами символы. */
  readonly mesh: THREE.Mesh;
  /** Контур и свечение материала под символами. */
  readonly under: THREE.Mesh;
  private geometry: THREE.InstancedBufferGeometry;
  private attrs: Attributes | null = null;
  private capacity = 0;
  private batch: GlyphBatch | null = null;
  private atlasVersion = -1;

  constructor(private readonly atlas: GlyphSource) {
    this.geometry = createQuadGeometry();
    this.geometry.instanceCount = 0;
    this.under = new THREE.Mesh(this.geometry, createInstanceMaterial(atlas, true));
    this.mesh = new THREE.Mesh(this.geometry, createInstanceMaterial(atlas, false));
    for (const mesh of [this.under, this.mesh]) {
      mesh.frustumCulled = false;
      this.object.add(mesh);
    }
    this.under.visible = false;
  }

  /** Время кадра, мс: по нему шейдер двигает бегущие материалы. */
  setTime(time: number): void {
    for (const mesh of [this.under, this.mesh]) {
      (mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = time / 1000;
    }
  }

  /** Место потока в порядке отрисовки: подложка сразу под своими символами. */
  setRenderOrder(order: number): void {
    this.under.renderOrder = order;
    this.mesh.renderOrder = order + 0.5;
  }

  update(batch: GlyphBatch): void {
    this.batch = batch;
    if (batch.count > this.capacity) this.grow(batch.count);
    const attrs = this.attrs;
    if (!attrs) return;
    // Прямоугольник атласа ищется один раз на символ таблицы, а не на каждый инстанс.
    const rects = batch.glyphs.map((glyph) => this.atlas.getRect(glyph));
    const entries = Object.entries(attrs) as [keyof Attributes, THREE.InstancedBufferAttribute][];
    const arrays = Object.fromEntries(
      entries.map(([key, attr]) => [key, attr.array as Float32Array]),
    ) as Record<keyof Attributes, Float32Array>;
    const d = batch.data;
    let material = false;
    for (let i = 0; i < batch.count; i++) {
      const o = i * INSTANCE_FLOATS;
      // Прямые записи, без промежуточных массивов: поток заливается на каждый кадр.
      arrays.center[i * 2] = d[o + INSTANCE.x];
      arrays.center[i * 2 + 1] = d[o + INSTANCE.y];
      arrays.pose[i * 3] = d[o + INSTANCE.rot];
      arrays.pose[i * 3 + 1] = d[o + INSTANCE.sx];
      arrays.pose[i * 3 + 2] = d[o + INSTANCE.sy];
      const rect = rects[d[o + INSTANCE.glyph]];
      arrays.uv[i * 4] = rect.u0;
      arrays.uv[i * 4 + 1] = rect.v0;
      arrays.uv[i * 4 + 2] = rect.u1;
      arrays.uv[i * 4 + 3] = rect.v1;
      copy(arrays.fg, i * 4, d, o + INSTANCE.fg, 4);
      copy(arrays.bg, i * 4, d, o + INSTANCE.bg, 4);
      const m = o + INSTANCE.material;
      copy(arrays.outline, i * 4, d, m + MATERIAL.outline, 4);
      copy(arrays.glow, i * 4, d, m + MATERIAL.glow, 4);
      arrays.glowStrength[i] = d[m + MATERIAL.glowStrength];
      copy(arrays.shine, i * 4, d, m + MATERIAL.shine, 4);
      // Шаг, скорость и угол блика, а четвёртым — дизеринг: оба читает проход символов.
      copy(arrays.shineMotion, i * 4, d, m + MATERIAL.shineMotion, 4);
      // Мягкость свечения, строки развёртки и крупный пиксель — хвост чисел материала.
      copy(arrays.extra, i * 3, d, m + MATERIAL.glowSoft, 3);
      if (d[m + MATERIAL.outline + 3] > 0 || d[m + MATERIAL.glow + 3] > 0) material = true;
    }
    for (const attr of Object.values(attrs) as THREE.InstancedBufferAttribute[]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, batch.count * attr.itemSize);
      attr.needsUpdate = true;
    }
    this.geometry.instanceCount = batch.count;
    this.under.visible = material;
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
    const geometry = createQuadGeometry();
    const entries = (Object.keys(SIZES) as (keyof Attributes)[]).map((key) => {
      const attr = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * SIZES[key]),
        SIZES[key],
      );
      attr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(NAMES[key], attr);
      return [key, attr] as const;
    });
    this.geometry.dispose();
    this.geometry = geometry;
    this.mesh.geometry = geometry;
    this.under.geometry = geometry;
    this.attrs = Object.fromEntries(entries) as unknown as Attributes;
    this.capacity = capacity;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    (this.under.material as THREE.Material).dispose();
  }
}
