import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toHex } from '../../core/color';
import type { RgbaImage } from '../../core/quantize';
import { srgbFromLinear } from '../../core/scene3d/mesh';
import { MAX_TEXTURE_SIZE, type MeshPart3D } from '../../core/scene3d/types';

/**
 * Модель из glTF (.glb или .gltf со встроенными данными) в части документа, только на чтение.
 * Сетки запекаются в координаты модели вместе с трансформами узлов; от материала остаются
 * базовый цвет, цвета вершин и текстура цвета. Карты нормалей, металл, шероховатость, скиннинг и
 * анимации файла не переносятся: свет у 3D-слоя свой, движение — ключами редактора.
 */
export async function loadModelParts(data: ArrayBuffer): Promise<MeshPart3D[]> {
  const gltf = await new GLTFLoader().parseAsync(data, '');
  gltf.scene.updateMatrixWorld(true);
  const images = new Map<THREE.Texture, RgbaImage | null>();
  const parts: MeshPart3D[] = [];
  gltf.scene.traverseVisible((object) => {
    // Линии и точки glTF не треугольники: символами их не нарисовать.
    if (!(object as Partial<THREE.Mesh>).isMesh) return;
    const part = meshPart(object as THREE.Mesh, images);
    if (part) parts.push(part);
  });
  return parts;
}

type Channel = 'color' | 'map';

/** Цвет или текстура материала, если у материала они есть. */
function materialValue(material: THREE.Material, channel: 'color'): THREE.Color | null;
function materialValue(material: THREE.Material, channel: 'map'): THREE.Texture | null;
function materialValue(material: THREE.Material, channel: Channel) {
  const value: unknown = (material as unknown as Record<Channel, unknown>)[channel];
  return value instanceof THREE.Color || value instanceof THREE.Texture ? value : null;
}

function meshPart(
  mesh: THREE.Mesh,
  images: Map<THREE.Texture, RgbaImage | null>,
): MeshPart3D | null {
  const source = mesh.geometry;
  if (!source.getAttribute('position')) return null;
  const geometry = source.getAttribute('normal') ? source : withNormals(source);
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const map = material ? materialValue(material, 'map') : null;
  const color = (material && materialValue(material, 'color')) ?? new THREE.Color(1, 1, 1);
  let texture: RgbaImage | null = null;
  if (map && geometry.getAttribute('uv')) {
    if (!images.has(map)) images.set(map, textureImage(map));
    texture = images.get(map) ?? null;
  }
  const count = geometry.getAttribute('position').count;
  return {
    positions: transformed(geometry, 'position', mesh.matrixWorld),
    normals: transformed(geometry, 'normal', mesh.matrixWorld),
    uvs: texture ? read(geometry, 'uv', 2, (v) => v) : null,
    colors: geometry.getAttribute('color') ? read(geometry, 'color', 3, srgbFromLinear) : null,
    indices: geometry.index
      ? Uint32Array.from(geometry.index.array)
      : Uint32Array.from({ length: count }, (_, i) => i),
    // glTF хранит цвета линейными, документ и шейдер 3D-слоя — в sRGB.
    color: toHex({
      r: srgbFromLinear(color.r),
      g: srgbFromLinear(color.g),
      b: srgbFromLinear(color.b),
      a: 1,
    }),
    texture,
  };
}

/** Копия геометрии с гладкими нормалями: в glTF нормали необязательны. */
function withNormals(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const copy = geometry.clone();
  copy.computeVertexNormals();
  return copy;
}

/** Атрибут числами с плавающей точкой: в glTF он бывает целым, нормированным, перемежённым. */
function read(
  geometry: THREE.BufferGeometry,
  name: string,
  size: 2 | 3,
  map: (v: number) => number,
): Float32Array {
  const attribute = geometry.getAttribute(name);
  const out = new Float32Array(attribute.count * size);
  for (let i = 0; i < attribute.count; i++) {
    out[i * size] = map(attribute.getX(i));
    out[i * size + 1] = map(attribute.getY(i));
    if (size === 3) out[i * size + 2] = map(attribute.getZ(i));
  }
  return out;
}

/** Точки или нормали в координатах модели: с трансформами всех родителей узла. */
function transformed(
  geometry: THREE.BufferGeometry,
  name: 'position' | 'normal',
  matrix: THREE.Matrix4,
): Float32Array {
  const attribute = geometry.getAttribute(name);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const out = new Float32Array(attribute.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < attribute.count; i++) {
    v.fromBufferAttribute(attribute, i);
    if (name === 'position') v.applyMatrix4(matrix);
    else v.applyMatrix3(normalMatrix).normalize();
    out.set([v.x, v.y, v.z], i * 3);
  }
  return out;
}

/** Текстура картинкой не крупнее `MAX_TEXTURE_SIZE`: в ячейку всё равно попадает её среднее. */
function textureImage(texture: THREE.Texture): RgbaImage | null {
  const image = texture.image as (CanvasImageSource & { width: number; height: number }) | null;
  if (!image || !image.width || !image.height) return null;
  const k = Math.min(1, MAX_TEXTURE_SIZE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * k));
  const height = Math.max(1, Math.round(image.height * k));
  const context = new OffscreenCanvas(width, height).getContext('2d');
  if (!context) return null;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return { width, height, data: new Uint8Array(context.getImageData(0, 0, width, height).data) };
}
