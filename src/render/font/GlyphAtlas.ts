import * as THREE from 'three';

export interface GlyphRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

export interface GlyphAtlasOptions {
  readonly fontFamily: string;
  /** Размер ячейки атласа в пикселях. Для пиксельного шрифта кратен размеру его сетки. */
  readonly cellSize?: number;
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
 * Атлас глифов, растеризуемый на лету через Canvas2D. Глифы добавляются по требованию,
 * при переполнении атлас растёт вниз до потолка, а version сообщает рендереру, что UV изменились.
 * Когда потолок достигнут, новые глифы получают запасной символ вместо бесконечного роста.
 */
export class GlyphAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly cellSize: number;
  version = 0;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly columns: number;
  private rows: number;
  private readonly maxRows: number;
  private readonly fontFamily: string;
  private readonly indices = new Map<string, number>();
  private nextIndex = 1;
  private fontSize = 0;
  private baseline = 0;
  private fallbackIndex = 0;
  private exhausted = false;
  /** Отдельный холст для замера глифов: из рабочего холста атласа пиксели обратно не читаются. */
  private scratch: CanvasRenderingContext2D | null = null;
  private readonly coverages = new Map<string, number>();

  constructor(options: GlyphAtlasOptions) {
    this.fontFamily = options.fontFamily;
    this.cellSize = options.cellSize ?? 32;
    this.columns = options.columns ?? 32;
    this.rows = options.rows ?? 16;
    const maxHeight = options.maxTextureHeight ?? DEFAULT_MAX_TEXTURE_HEIGHT;
    this.maxRows = Math.max(this.rows, Math.floor(maxHeight / this.cellSize));
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.columns * this.cellSize;
    this.canvas.height = this.rows * this.cellSize;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.measureFont();
    this.fallbackIndex = this.allocate(FALLBACK_GLYPH);
  }

  /** Сколько глифов ещё поместится без роста и сколько всего может поместиться. */
  get capacity(): { used: number; total: number } {
    return { used: this.nextIndex, total: this.columns * this.maxRows };
  }

  /** Подбирает размер шрифта так, чтобы строка помещалась в ячейку, и запоминает базовую линию. */
  private measureFont(): void {
    let size = this.cellSize;
    const measure = (): { ascent: number; descent: number } => {
      this.ctx.font = `${size}px "${this.fontFamily}"`;
      const m = this.ctx.measureText('M');
      return {
        ascent: m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent,
        descent: m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent,
      };
    };
    let { ascent, descent } = measure();
    const lineHeight = ascent + descent;
    if (lineHeight > this.cellSize && lineHeight > 0) {
      size = Math.floor((size * this.cellSize) / lineHeight);
      ({ ascent, descent } = measure());
    }
    this.fontSize = size;
    this.baseline = (this.cellSize - (ascent + descent)) / 2 + ascent;
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
      u0: (col * this.cellSize) / w,
      v0: (row * this.cellSize) / h,
      u1: ((col + 1) * this.cellSize) / w,
      v1: ((row + 1) * this.cellSize) / h,
    };
  }

  private drawGlyph(glyph: string, index: number): void {
    const col = index % this.columns;
    const row = Math.floor(index / this.columns);
    const x = col * this.cellSize;
    const y = row * this.cellSize;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, this.cellSize, this.cellSize);
    ctx.clip();
    ctx.clearRect(x, y, this.cellSize, this.cellSize);
    this.paint(ctx, glyph, x, y);
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  /** Глиф в ячейке с левым верхним углом (x, y): одинаково и для атласа, и для замера. */
  private paint(ctx: CanvasRenderingContext2D, glyph: string, x: number, y: number): void {
    ctx.font = `${this.fontSize}px "${this.fontFamily}"`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(glyph, x + this.cellSize / 2, y + this.baseline);
  }

  /**
   * Доля ячейки, которую закрашивает глиф: 0 у пробела, около 1 у «█». Нужна миниатюрам кадров:
   * они передают не форму символа, а его плотность. Считается один раз на глиф.
   */
  coverage(glyph: string): number {
    if (glyph === '') return 0;
    const known = this.coverages.get(glyph);
    if (known !== undefined) return known;
    const size = this.cellSize;
    const ctx = this.scratchContext();
    if (!ctx) return 0.5;
    ctx.clearRect(0, 0, size, size);
    this.paint(ctx, glyph, 0, 0);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    let ink = 0;
    for (let i = 3; i < pixels.length; i += 4) ink += pixels[i];
    const value = ink / (255 * size * size);
    this.coverages.set(glyph, value);
    return value;
  }

  /**
   * Отдельный лист для рантайма движка (`core/bytefall.ts`): ячейка 0 залита белым, символ
   * `glyphs[i]` — в ячейке `i + 1`. Альфа бинарная, как у `cover` в шейдере: пиксельный шрифт
   * в движке не размоется и не даст полупрозрачной каймы.
   */
  sheet(glyphs: readonly string[], columns: number): HTMLCanvasElement {
    const size = this.cellSize;
    const canvas = document.createElement('canvas');
    canvas.width = columns * size;
    canvas.height = Math.ceil((glyphs.length + 1) / columns) * size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D is not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    glyphs.forEach((glyph, i) => {
      const x = ((i + 1) % columns) * size;
      const y = Math.floor((i + 1) / columns) * size;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();
      this.paint(ctx, glyph, x, y);
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
    canvas.width = this.cellSize;
    canvas.height = this.cellSize;
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
    next.height = rows * this.cellSize;
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
