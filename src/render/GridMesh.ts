import * as THREE from 'three';
import type { CellBuffer } from '../core/compositor';
import {
  type TileLayout,
  mergeTileRanges,
  sameLayout,
  slotCount,
  tileLayout,
  tileRect,
} from '../core/tiles';
import type { GlyphRect } from './font/GlyphAtlas';

/**
 * То, что меш берёт у атласа. Отдельный интерфейс, а не сам класс: атлас растеризует глифы через
 * Canvas2D, и без этой границы раскладку инстансов нельзя было бы проверить тестами вне браузера.
 */
export interface GlyphSource {
  readonly texture: THREE.Texture;
  readonly version: number;
  getRect(glyph: string): GlyphRect;
}

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

/**
 * Вся сетка одним инстансированным вызовом: по инстансу на ячейку, пустые отбрасываются в шейдере.
 *
 * Инстансы уложены тайл за тайлом, а не построчно. Порядок здесь не косметика: он делает каждый
 * тайл непрерывным куском буфера, и поэтому правку одной ячейки можно залить на GPU одним
 * маленьким диапазоном вместо всего холста.
 */
export class GridMesh {
  readonly mesh: THREE.Mesh;
  private geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private uvAttr: THREE.InstancedBufferAttribute | null = null;
  private fgAttr: THREE.InstancedBufferAttribute | null = null;
  private bgAttr: THREE.InstancedBufferAttribute | null = null;
  private layout: TileLayout = tileLayout(1, 1);
  private atlasVersion = -1;

  constructor(private readonly atlas: GlyphSource) {
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

  /**
   * Переносит кадр в атрибуты инстансов. `dirty` перечисляет тайлы, которые действительно
   * изменились; без него перезаливается весь холст.
   */
  update(buffer: CellBuffer, dirty?: Iterable<number>): void {
    const layout = this.layout;
    if (!sameLayout(layout, tileLayout(buffer.width, buffer.height))) {
      this.rebuild(buffer.width, buffer.height);
      this.writeTiles(buffer, null);
      return;
    }
    this.writeTiles(buffer, dirty ?? null);
  }

  /** После роста атласа старые UV недействительны: буфер нужно перезалить целиком. */
  needsRefresh(): boolean {
    return this.atlasVersion !== this.atlas.version;
  }

  /** Перечисленные тайлы, либо все, если список не задан. */
  private writeTiles(buffer: CellBuffer, dirty: Iterable<number> | null): void {
    const layout = this.layout;
    const uv = this.uvAttr as THREE.InstancedBufferAttribute;
    const fg = this.fgAttr as THREE.InstancedBufferAttribute;
    const bg = this.bgAttr as THREE.InstancedBufferAttribute;
    const uvArray = uv.array as Float32Array;
    const fgArray = fg.array as Float32Array;
    const bgArray = bg.array as Float32Array;

    const tiles = dirty === null ? null : [...dirty];
    const list = tiles ?? range(layout.count);
    if (list.length === 0) return;

    for (const tile of list) {
      const rect = tileRect(layout, tile);
      let slot = layout.starts[tile];
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        const cell = y * buffer.width + rect.x;
        // Строка тайла непрерывна и в буфере кадра, и в слотах, поэтому цвета копируются
        // целым куском: поэлементная запись заметно дороже на полной перезаливке.
        const from = cell * 4;
        const to = (cell + rect.w) * 4;
        fgArray.set(buffer.fg.subarray(from, to), slot * 4);
        bgArray.set(buffer.bg.subarray(from, to), slot * 4);
        // UV поячеечно: каждый глиф ищется в атласе.
        for (let i = 0; i < rect.w; i++) {
          const uvRect = this.atlas.getRect(buffer.glyphs[cell + i]);
          const o = (slot + i) * 4;
          uvArray[o] = uvRect.u0;
          uvArray[o + 1] = uvRect.v0;
          uvArray[o + 2] = uvRect.u1;
          uvArray[o + 3] = uvRect.v1;
        }
        slot += rect.w;
      }
    }

    // Три атрибута по четыре числа на слот: диапазоны у всех одинаковые.
    for (const attr of [uv, fg, bg]) attr.clearUpdateRanges();
    if (tiles === null) {
      for (const attr of [uv, fg, bg]) attr.addUpdateRange(0, slotCount(layout) * 4);
    } else {
      for (const { start, end } of mergeTileRanges(layout, tiles)) {
        for (const attr of [uv, fg, bg]) attr.addUpdateRange(start * 4, (end - start) * 4);
      }
    }
    uv.needsUpdate = true;
    fg.needsUpdate = true;
    bg.needsUpdate = true;
    this.atlasVersion = this.atlas.version;
  }

  /**
   * Новый размер означает новую геометрию целиком: замена атрибутов на живой геометрии
   * оставила бы старые GPU-буферы без освобождения, а dispose геометрии чистит всё разом.
   */
  private rebuild(width: number, height: number): void {
    const layout = tileLayout(width, height);
    this.layout = layout;
    const count = slotCount(layout);
    const cells = new Float32Array(count * 2);
    for (let tile = 0; tile < layout.count; tile++) {
      const rect = tileRect(layout, tile);
      let slot = layout.starts[tile];
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++, slot++) {
          cells[slot * 2] = x;
          cells[slot * 2 + 1] = y;
        }
      }
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

function range(count: number): number[] {
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) out[i] = i;
  return out;
}
