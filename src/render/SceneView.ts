import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { CellBuffer } from '../core/compositor';
import type { Point, Rect } from '../core/geometry';
import { type CameraState, fitCamera, screenToWorld } from './camera';
import type { GlyphAtlas } from './font/GlyphAtlas';
import { GridMesh } from './GridMesh';
import { Overlay } from './Overlay';
import {
  DEFAULT_POST,
  type PostPasses,
  type PostSettings,
  applyPostSettings,
  createPostPasses,
  hasPost,
} from './post';

export { MAX_ZOOM, MIN_ZOOM, type CameraState } from './camera';

export interface RenderedPixels {
  readonly width: number;
  readonly height: number;
  /** RGBA сверху вниз. */
  readonly data: Uint8Array<ArrayBuffer>;
}

/**
 * Владеет WebGL-рендерером, ортокамерой и сценой. Ничего не знает о React и о сторах:
 * получает готовый CellBuffer и служебное состояние, рисует по требованию.
 */
export class SceneView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly grid: GridMesh;
  private readonly overlay = new Overlay();
  private readonly resizeObserver: ResizeObserver;
  private frame: number | null = null;
  private buffer: CellBuffer | null = null;
  private cameraState: CameraState = { centerX: 0, centerY: 0, zoom: 16 };
  private viewWidth = 1;
  private viewHeight = 1;
  private disposed = false;
  private readonly composer: EffectComposer;
  private readonly passes: PostPasses;
  private post: PostSettings = DEFAULT_POST;

  constructor(
    private readonly container: HTMLElement,
    atlas: GlyphAtlas,
  ) {
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.grid = new GridMesh(atlas);
    this.scene.add(this.overlay.group, this.grid.mesh);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.passes = createPostPasses(1, 1);
    for (const pass of this.passes.all) this.composer.addPass(pass);
    applyPostSettings(this.passes, this.post, 1);

    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  get size(): { width: number; height: number } {
    return { width: this.viewWidth, height: this.viewHeight };
  }

  /** `dirty` перечисляет изменившиеся тайлы; без него на GPU уходит весь холст. */
  setBuffer(buffer: CellBuffer, dirty?: Iterable<number>): void {
    this.buffer = buffer;
    this.grid.update(buffer, dirty);
    this.requestRender();
  }

  setDocument(width: number, height: number, background: string | null): void {
    this.overlay.setDocument(width, height, background);
    this.requestRender();
  }

  setWorkspaceColor(hex: string): void {
    this.renderer.setClearColor(new THREE.Color(hex), 1);
    this.requestRender();
  }

  setShowGrid(show: boolean): void {
    this.overlay.setShowGrid(show);
    this.requestRender();
  }

  setCursor(cell: Point | null): void {
    this.overlay.setCursor(cell);
    this.requestRender();
  }

  setSelection(rect: Rect | null): void {
    this.overlay.setSelection(rect);
    this.requestRender();
  }

  setObjectOutline(rect: Rect | null): void {
    this.overlay.setObjectOutline(rect);
    this.requestRender();
  }

  setCamera(state: CameraState): void {
    this.cameraState = state;
    this.updateCamera();
    this.requestRender();
  }

  setPost(post: PostSettings): void {
    this.post = post;
    applyPostSettings(this.passes, post, this.viewHeight * this.renderer.getPixelRatio());
    this.requestRender();
  }

  /** Камера, при которой документ целиком виден с полями. */
  fitCamera(width: number, height: number, padding = 24): CameraState {
    return fitCamera(this.size, width, height, padding);
  }

  screenToWorld(px: number, py: number): Point {
    return screenToWorld(this.cameraState, this.size, px, py);
  }

  /** Координаты ячейки под пикселем вьюпорта. Может выходить за пределы документа. */
  screenToCell(px: number, py: number): Point {
    const world = this.screenToWorld(px, py);
    return { x: Math.floor(world.x), y: Math.floor(-world.y) };
  }

  requestRender(): void {
    if (this.frame !== null || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  /**
   * Рендерит буфер без служебной графики в пиксели RGBA сверху вниз. Буфер может быть чужим,
   * например другим кадром анимации: после рендера возвращается текущий.
   */
  renderPixels(buffer: CellBuffer, pixelsPerCell: number): RenderedPixels {
    const { width, height } = buffer;
    const w = Math.round(width * pixelsPerCell);
    const h = Math.round(height * pixelsPerCell);
    const target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, stencilBuffer: false });
    const camera = new THREE.OrthographicCamera(0, width, 0, -height, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.updateProjectionMatrix();

    const previousClear = this.renderer.getClearColor(new THREE.Color());
    const previousAlpha = this.renderer.getClearAlpha();
    const swapped = buffer !== this.buffer;
    const pixels = new Uint8Array(w * h * 4);
    this.overlay.setChromeVisible(false);
    try {
      if (swapped) this.grid.update(buffer);
      this.renderer.setClearColor(0x000000, 0);
      if (hasPost(this.post)) {
        // Экспорт проходит через те же постэффекты, что и экран, но в своём размере.
        const exporter = new EffectComposer(this.renderer, target);
        exporter.renderToScreen = false;
        exporter.addPass(new RenderPass(this.scene, camera));
        const passes = createPostPasses(w, h);
        applyPostSettings(passes, this.post, h);
        for (const pass of passes.all) exporter.addPass(pass);
        exporter.render();
        this.renderer.readRenderTargetPixels(exporter.readBuffer, 0, 0, w, h, pixels);
        exporter.dispose();
      } else {
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, camera);
        this.renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
      }
    } finally {
      // Состояние рендерера восстанавливается даже при потере контекста посреди экспорта.
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(previousClear, previousAlpha);
      this.overlay.setChromeVisible(true);
      if (swapped && this.buffer) this.grid.update(this.buffer);
      target.dispose();
      this.requestRender();
    }

    // WebGL отдаёт строки снизу вверх.
    const data = new Uint8Array(w * h * 4);
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * rowBytes;
      data.set(pixels.subarray(src, src + rowBytes), y * rowBytes);
    }
    return { width: w, height: h, data };
  }

  /** Рендерит текущий документ без служебной графики в PNG заданного масштаба. */
  async exportPng(pixelsPerCell: number): Promise<Blob> {
    if (!this.buffer) throw new Error('Nothing to export');
    const { width, height, data } = this.renderPixels(this.buffer, pixelsPerCell);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
        'image/png',
      );
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.grid.dispose();
    this.overlay.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onContextRestored = (): void => {
    if (this.buffer) this.grid.update(this.buffer);
    this.requestRender();
  };

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.viewWidth = width;
    this.viewHeight = height;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    applyPostSettings(this.passes, this.post, height * this.renderer.getPixelRatio());
    this.updateCamera();
    // Рисуем сразу, а не через requestAnimationFrame. ResizeObserver срабатывает после раскладки,
    // но до отрисовки, поэтому отложенный кадр показал бы старый буфер, растянутый по CSS:
    // при перетаскивании границы панели холст заметно отставал и мылился.
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.render();
  }

  private updateCamera(): void {
    const { centerX, centerY, zoom } = this.cameraState;
    const halfW = this.viewWidth / 2 / zoom;
    const halfH = this.viewHeight / 2 / zoom;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.position.set(centerX, centerY, 10);
    this.camera.updateProjectionMatrix();
  }

  private render(): void {
    if (this.disposed) return;
    if (this.buffer && this.grid.needsRefresh()) this.grid.update(this.buffer);
    if (hasPost(this.post)) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
