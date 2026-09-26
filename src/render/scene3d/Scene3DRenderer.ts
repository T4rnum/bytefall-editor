import * as THREE from 'three';
import type { CellGrid } from '../../core/grid';
import { subsamplesFor } from '../../core/quantize';
import { type Scene3DRequest, buffersToCells } from '../../core/scene3d/render';
import type { Camera3D, Light3D, Node3D, Scene3D } from '../../core/scene3d/types';
import { Geometries } from './bodies';
import { type BodyMaterial, createBodyMaterial } from './scene3dShader';

const DEG = Math.PI / 180;

/** Направление на солнце в мире: азимут вокруг Y от +Z к +X, высота над горизонтом. */
function sunDirection(light: Light3D): THREE.Vector3 {
  const az = light.sunAzimuth * DEG;
  const el = light.sunElevation * DEG;
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}

/** Ближняя и дальняя плоскости по размеру сцены: глубина контуров меряется в этих пределах. */
function depthRange(scene: Scene3D): { near: number; far: number } {
  const [px, py, pz] = scene.camera.position;
  const radius = scene.nodes.reduce((r, n) => {
    const reach = Math.hypot(n.position[0] - px, n.position[1] - py, n.position[2] - pz);
    return Math.max(r, reach + Math.max(...n.scale.map(Math.abs)));
  }, 1);
  const far = radius * 1.5 + 1;
  return { near: far * 0.001, far };
}

function makeCamera(spec: Camera3D, aspect: number, near: number, far: number): THREE.Camera {
  const camera =
    spec.projection === 'perspective'
      ? new THREE.PerspectiveCamera(spec.fov, aspect, near, far)
      : new THREE.OrthographicCamera(
          (-spec.size * aspect) / 2,
          (spec.size * aspect) / 2,
          spec.size / 2,
          -spec.size / 2,
          near,
          far,
        );
  camera.position.set(...spec.position);
  const [tx, ty, tz] = spec.target;
  if (camera.position.distanceTo(new THREE.Vector3(tx, ty, tz)) > 1e-6) camera.lookAt(tx, ty, tz);
  camera.updateMatrixWorld();
  return camera;
}

/** Строки буфера WebGL идут снизу вверх: переворот к картинке сверху вниз. */
function flipRows<T extends Uint8Array | Float32Array>(
  data: T,
  width: number,
  height: number,
  n: number,
): T {
  const row = width * n;
  const out = new (data.constructor as new (length: number) => T)(data.length);
  for (let y = 0; y < height; y++)
    out.set(data.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  return out;
}

/**
 * Рендер 3D-сцены слоя в ячейки (DESIGN.md, раздел 6, режим A). Свой контекст WebGL на
 * внеэкранном холсте: рендер зовут и экспорт, и миниатюры, и им не нужен вьюпорт.
 */
export class Scene3DRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly geometries = new Geometries();
  private color: THREE.WebGLRenderTarget | null = null;
  private geometry: THREE.WebGLRenderTarget | null = null;
  /** Можно ли читать числа с плавающей точкой: без этого контуры ищутся по альфе. */
  private readonly floats: boolean;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: new OffscreenCanvas(1, 1),
      antialias: false,
      alpha: true,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.floats = this.renderer.extensions.has('EXT_color_buffer_float');
  }

  render({ scene, width, height, meshes }: Scene3DRequest): CellGrid {
    const sub = subsamplesFor(width, height);
    const fw = width * sub;
    const fh = height * sub;
    this.ensureTargets(fw, fh);
    const { near, far } = depthRange(scene);
    const camera = makeCamera(scene.camera, width / height, near, far);
    const { root, materials } = this.build(scene, meshes);
    const sunDir = sunDirection(scene.light).transformDirection(camera.matrixWorldInverse);
    const { light } = scene;
    for (const m of materials) {
      m.uniforms.uAmbient.value.set(light.ambientColor).multiplyScalar(light.ambient);
      m.uniforms.uSun.value.set(light.sunColor).multiplyScalar(light.sun);
      m.uniforms.uSunDir.value.copy(sunDir);
      m.uniforms.uNear.value = near;
      m.uniforms.uFar.value = far;
    }
    const rgba = new Uint8Array(fw * fh * 4);
    this.pass(root, camera, this.color!, 0, rgba);
    const geo = new Float32Array(fw * fh * 4);
    if (this.floats) {
      for (const m of materials) m.uniforms.uGeometry.value = 1;
      this.pass(root, camera, this.geometry!, 1, geo);
    }
    this.renderer.setRenderTarget(null);
    for (const m of materials) m.material.dispose();
    this.geometries.keep(meshes);
    return buffersToCells(this.buffers(width, height, sub, rgba, geo), scene.quantize);
  }

  dispose(): void {
    this.geometries.dispose();
    this.color?.dispose();
    this.geometry?.dispose();
    this.renderer.dispose();
  }

  private ensureTargets(width: number, height: number): void {
    if (this.color && this.color.width === width && this.color.height === height) return;
    this.color?.dispose();
    this.geometry?.dispose();
    this.color = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
    this.geometry = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      type: THREE.FloatType,
    });
  }

  private pass(
    root: THREE.Object3D,
    camera: THREE.Camera,
    target: THREE.WebGLRenderTarget,
    background: number,
    out: Uint8Array | Float32Array,
  ): void {
    this.renderer.setRenderTarget(target);
    // Пусто у цвета — прозрачное, у геометрии — нулевая нормаль и глубина 1.
    this.renderer.setClearColor(0x000000, background);
    this.renderer.clear();
    this.renderer.render(root, camera);
    this.renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, out);
  }

  /** Сцена Three.js на один рендер: тела с материалами. Геометрии общие и живут дольше. */
  private build(scene: Scene3D, meshes: Scene3DRequest['meshes']) {
    const root = new THREE.Scene();
    const materials: BodyMaterial[] = [];
    const add = (
      node: Node3D,
      geometry: THREE.BufferGeometry,
      color: THREE.Color,
      vc: boolean,
      map: THREE.Texture | null,
    ) => {
      const body = createBodyMaterial({ vertexColors: vc, texture: map });
      body.uniforms.uColor.value.copy(color);
      materials.push(body);
      const mesh = new THREE.Mesh(geometry, body.material);
      mesh.position.set(...node.position);
      mesh.rotation.set(
        node.rotation[0] * DEG,
        node.rotation[1] * DEG,
        node.rotation[2] * DEG,
        'XYZ',
      );
      mesh.scale.set(...node.scale);
      root.add(mesh);
    };
    for (const node of scene.nodes) {
      if (!node.visible) continue;
      const tint = new THREE.Color(node.color);
      if (node.kind !== 'mesh') {
        add(node, this.geometries.primitive(node.kind), tint, false, null);
        continue;
      }
      const model = meshes.find((m) => m.id === node.mesh);
      for (const part of model?.parts ?? []) {
        const { geometry, texture } = this.geometries.part(part);
        add(
          node,
          geometry,
          tint.clone().multiply(new THREE.Color(part.color)),
          part.colors !== null,
          texture,
        );
      }
    }
    return { root, materials };
  }

  /** Буферы для квантайзера: строки сверху вниз, нормаль и глубина порознь. */
  private buffers(width: number, height: number, sub: number, rgba: Uint8Array, geo: Float32Array) {
    const fw = width * sub;
    const fh = height * sub;
    const color = flipRows(rgba, fw, fh, 4);
    const flipped = flipRows(geo, fw, fh, 4);
    const normal = new Float32Array(fw * fh * 3);
    const depth = new Float32Array(fw * fh);
    for (let i = 0; i < fw * fh; i++) {
      normal[i * 3] = flipped[i * 4];
      normal[i * 3 + 1] = flipped[i * 4 + 1];
      normal[i * 3 + 2] = flipped[i * 4 + 2];
      // Без чтения чисел с плавающей точкой глубина — по прозрачности: силуэт всё равно виден.
      depth[i] = this.floats ? flipped[i * 4 + 3] : 1 - color[i * 4 + 3] / 255;
    }
    return { width, height, sub, rgba: color, normal, depth };
  }
}
