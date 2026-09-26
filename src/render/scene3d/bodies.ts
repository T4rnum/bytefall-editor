import * as THREE from 'three';
import type { Mesh3D, MeshPart3D, Primitive3D } from '../../core/scene3d/types';

/**
 * Геометрии тел: примитивы единичного размера — трансформ тела их растягивает, — и части
 * моделей документа. Всё создаётся один раз и живёт, пока нужно: сцена рисуется каждый кадр.
 */

const PRIMITIVES: Readonly<Record<Primitive3D, () => THREE.BufferGeometry>> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 16),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  cone: () => new THREE.ConeGeometry(0.5, 1, 32),
  torus: () => new THREE.TorusGeometry(0.35, 0.15, 16, 48),
  plane: () => new THREE.PlaneGeometry(1, 1),
};

/** Геометрия примитива, общая для всех тел этого вида. */
export class Geometries {
  private readonly primitives = new Map<Primitive3D, THREE.BufferGeometry>();
  private parts = new Map<
    MeshPart3D,
    { geometry: THREE.BufferGeometry; texture: THREE.Texture | null }
  >();

  primitive(kind: Primitive3D): THREE.BufferGeometry {
    let geometry = this.primitives.get(kind);
    if (!geometry) {
      geometry = PRIMITIVES[kind]();
      this.primitives.set(kind, geometry);
    }
    return geometry;
  }

  /** Геометрия и текстура части модели: из массивов документа, без копий. */
  part(part: MeshPart3D): { geometry: THREE.BufferGeometry; texture: THREE.Texture | null } {
    let known = this.parts.get(part);
    if (!known) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
      if (part.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
      if (part.colors) geometry.setAttribute('color', new THREE.BufferAttribute(part.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
      let texture: THREE.Texture | null = null;
      if (part.texture && part.uvs) {
        const { width, height, data } = part.texture;
        texture = new THREE.DataTexture(new Uint8Array(data), width, height, THREE.RGBAFormat);
        // Картинка текстуры лежит строками сверху вниз, как в glTF: v идёт сверху.
        texture.flipY = false;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
      }
      known = { geometry, texture };
      this.parts.set(part, known);
    }
    return known;
  }

  /** Освобождает части моделей, которых больше нет в документе. */
  keep(meshes: readonly Mesh3D[]): void {
    const alive = new Set(meshes.flatMap((m) => m.parts));
    for (const [part, gpu] of this.parts) {
      if (alive.has(part)) continue;
      gpu.geometry.dispose();
      gpu.texture?.dispose();
      this.parts.delete(part);
    }
  }

  dispose(): void {
    this.keep([]);
    for (const geometry of this.primitives.values()) geometry.dispose();
    this.primitives.clear();
  }
}
