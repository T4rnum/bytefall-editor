import * as THREE from 'three';
import type { GlyphPainter } from './painters';

export interface GlyphRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export interface GlyphAtlasOptions {
  /** Чем рисуются глифы и какого размера ячейка: см. `painters.ts`. */
  readonly painter: GlyphPainter;
  readonly columns?: number;
  readonly rows?: number;
  /** Потолок высоты текстуры в пикселях: защита от документов с тысячами разных глифов. */
  readonly maxTextureHeight?: number;
}

/** Ячейка 0 всегда пустая: на неё ссылаются ячейки без символа. */
export const BLANK_RECT: GlyphRect = { u0: 0, v0: 0, u1: 0, v1: 0 };

/** Рисуется вместо глифов, для которых в атласе не осталось места. */
export const FALLBACK_GLYPH = '?';

const DEFAULT_MAX_TEXTURE_HEIGHT = 4096;

/**
 * Атлас глифов, растеризуемый на лету через Canvas2D: форму символа даёт `GlyphPainter`,
 * атлас только раскладывает ячейки. Глифы добавляются по требованию,
 * при переполнении атлас растёт вниз до потолка, а version сообщает рендереру, что UV изменились.
 * Когда потолок достигнут, новые глифы получают запасной символ вместо бесконечного роста.
 */
export class GlyphAtlas {
  readonly texture: THREE.CanvasTexture;
  /** Ячейка атласа в пикселях: прямоугольная у шрифтов с неквадратной сеткой. */
  readonly cellWidth: number;
  readonly cellHeight: number;
  /** Сетка шрифта: пикселей шрифта в ячейке по каждой оси. */
  readonly gridWidth: number;
  readonly gridHeight: number;
  version = 0;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly columns: number;
  private rows: number;
  private readonly maxRows: number;
  private readonly painter: GlyphPainter;
  private readonly indices = new Map<string, number>();
  private nextIndex = 1;
  private fallbackIndex = 0;
  private exhausted = false;
  /** Отдельный холст для замера глифов: из рабочего холста атласа пиксели обратно не читаются. */
  private scratch: CanvasRenderingContext2D | null = null;
  private readonly coverages = new Map<string, number>();

  constructor(options: GlyphAtlasOptions) {
    this.painter = options.painter;
    this.cellWidth = options.painter.cellWidth;
    this.cellHeight = options.painter.cellHeight;
    this.gridWidth = options.painter.gridWidth;
    this.gridHeight = options.painter.gridHeight;
    this.columns = options.columns ?? 32;
    this.rows = options.rows ?? 16;
    const maxHeight = options.maxTextureHeight ?? DEFAULT_MAX_TEXTURE_HEIGHT;
    this.maxRows = Math.max(this.rows, Math.floor(maxHeight / this.cellHeight));
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.columns * this.cellWidth;
    this.canvas.height = this.rows * this.cellHeight;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.fallbackIndex = this.allocate(FALLBACK_GLYPH);
  }

  /** Сколько глифов ещё поместится без роста и сколько всего может поместиться. */
  get capacity(): { used: number; total: number } {
    return { used: this.nextIndex, total: this.columns * this.maxRows };
  }

  getRect(glyph: string): GlyphRect {
    if (glyph === '') return BLANK_RECT;
    const known = this.indices.get(glyph);
    if (known !== undefined) return this.rectOf(known);
    if (this.nextIndex >= this.columns * this.rows && !this.tryGrow()) {
      return this.rectOf(this.fallbackIndex);
    }
    return this.rectOf(this.allocate(glyph));
  }

  private allocate(glyph: string): number {
    const index = this.nextIndex++;
    this.indices.set(glyph, index);
    this.drawGlyph(glyph, index);
    return index;
  }

  private rectOf(index: number): GlyphRect {
    const col = index % this.columns;
    const row = Math.floor(index / this.columns);
    const w = this.canvas.width;
    const h = this.canvas.height;
    return {
      u0: (col * this.cellWidth) / w,
      v0: (row * this.cellHeight) / h,
      u1: ((col + 1) * this.cellWidth) / w,
      v1: ((row + 1) * this.cellHeight) / h,
    };
  }

  private drawGlyph(glyph: string, index: number): void {
    const col = index % this.columns;
    const row = Math.floor(index / this.columns);
    const x = col * this.cellWidth;
    const y = row * this.cellHeight;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, this.cellWidth, this.cellHeight);
    ctx.clip();
    ctx.clearRect(x, y, this.cellWidth, this.cellHeight);
    this.painter.paint(ctx, glyph, x, y);
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  /**
   * Доля ячейки, которую закрашивает глиф: 0 у пробела, около 1 у «█». Нужна миниатюрам кадров:
   * они передают не форму символа, а его плотность. Считается один раз на глиф.
   */
  coverage(glyph: string): number {
    if (glyph === '') return 0;
    const known = this.coverages.get(glyph);
    if (known !== undefined) return known;
    const { cellWidth: w, cellHeight: h } = this;
    const ctx = this.scratchContext();
    if (!ctx) return 0.5;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    this.painter.paint(ctx, glyph, 0, 0);
    ctx.restore();
    const pixels = ctx.getImageData(0, 0, w, h).data;
    let ink = 0;
    for (let i = 3; i < pixels.length; i += 4) ink += pixels[i];
    const value = ink / (255 * w * h);
    this.coverages.set(glyph, value);
    return value;
  }

  /**
   * Отдельный лист для рантайма движка (`core/bytefall.ts`): ячейка 0 залита белым, символ
   * `glyphs[i]` — в ячейке `i + 1`. Альфа бинарная, как у `cover` в шейдере: пиксельный шрифт
   * в движке не размоется и не даст полупрозрачной каймы.
   */
  sheet(glyphs: readonly string[], columns: number): HTMLCanvasElement {
    const { cellWidth: w, cellHeight: h } = this;
    const canvas = document.createElement('canvas');
    canvas.width = columns * w;
    canvas.height = Math.ceil((glyphs.length + 1) / columns) * h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D is not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    glyphs.forEach((glyph, i) => {
      const x = ((i + 1) % columns) * w;
      const y = Math.floor((i + 1) / columns) * h;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      this.painter.paint(ctx, glyph, x, y);
      ctx.restore();
    });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = image.data;
    for (let i = 0; i < px.length; i += 4) {
      const on = px[i + 3] >= 128 ? 255 : 0;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = on;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  /** Холст для замеров читается часто, поэтому браузеру сразу сказано держать его в памяти. */
  private scratchContext(): CanvasRenderingContext2D | null {
    if (this.scratch) return this.scratch;
    const canvas = document.createElement('canvas');
    canvas.width = this.cellWidth;
    canvas.height = this.cellHeight;
    this.scratch = canvas.getContext('2d', { willReadFrequently: true });
    return this.scratch;
  }

  /** Удваивает число строк до потолка, сохраняя нарисованные глифы на тех же индексах. */
  private tryGrow(): boolean {
    if (this.exhausted) return false;
    if (this.rows >= this.maxRows) {
      this.exhausted = true;
      console.warn(
        `GlyphAtlas: capacity of ${this.columns * this.maxRows} glyphs reached, using "${FALLBACK_GLYPH}"`,
      );
      return false;
    }
    const rows = Math.min(this.rows * 2, this.maxRows);
    const next = document.createElement('canvas');
    next.width = this.canvas.width;
    next.height = rows * this.cellHeight;
    const ctx = next.getContext('2d');
    if (!ctx) {
      this.exhausted = true;
      return false;
    }
    ctx.drawImage(this.canvas, 0, 0);
    this.canvas = next;
    this.ctx = ctx;
    this.rows = rows;
    this.texture.image = next;
    this.texture.needsUpdate = true;
    this.version += 1;
    return true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}
