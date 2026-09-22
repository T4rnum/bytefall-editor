import { type Animation, type Frame, frameDocument } from '../../core/animation';
import { type CellBuffer, composite } from '../../core/compositor';
import {
  type GlyphCoverage,
  type Thumbnail,
  fitThumbnail,
  renderThumbnail,
} from '../../core/thumbnail';

/** Место под миниатюру в таймлайне, в CSS-пикселях. */
export const THUMB_HEIGHT = 36;
export const THUMB_MAX_WIDTH = 72;

/**
 * Пауза после правки, прежде чем пересчитывать. Миниатюра не обязана меняться на каждый мазок,
 * а сборка кадра на большом холсте стоит миллисекунды, которые во время рисования нужнее кисти.
 */
export const SETTLE_MS = 250;
/** Сколько считать подряд, прежде чем отдать поток интерфейсу. */
const SLICE_MS = 8;

interface Entry {
  readonly frame: Frame;
  /** Всё, кроме самого кадра, от чего зависит картинка. */
  readonly key: string;
  readonly thumb: Thumbnail;
}

/**
 * Миниатюры кадров. Кадры неизменяемые, поэтому устаревшую миниатюру видно по ссылке на кадр:
 * правка одного кадра пересчитывает одну картинку, а смена фона или размера — все.
 *
 * Считается в фоне порциями: после операции над всеми кадрами сотни сборок подряд заморозили
 * бы интерфейс. Текущий кадр идёт первым, остальные по порядку.
 */
export class ThumbnailCache {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private animation: Animation | null = null;
  private current = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scratch: CellBuffer | undefined;
  private version = 0;

  constructor(
    private readonly coverage: GlyphCoverage,
    private readonly pixelRatio: () => number = () => 1,
  ) {}

  /** Анимация или текущий кадр сменились: запланировать пересчёт устаревшего. */
  sync(animation: Animation, current: number): void {
    this.animation = animation;
    this.current = current;
    const alive = new Set(animation.frames.map((frame) => frame.id));
    for (const id of this.entries.keys()) if (!alive.has(id)) this.entries.delete(id);
    this.schedule(SETTLE_MS);
  }

  get(frameId: string): Thumbnail | undefined {
    return this.entries.get(frameId)?.thumb;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getVersion = (): number => this.version;

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private keyOf(animation: Animation): string {
    return `${animation.width}x${animation.height}:${animation.background}:${this.pixelRatio()}`;
  }

  private nextStale(animation: Animation, key: string): number {
    const stale = (i: number): boolean => {
      const frame = animation.frames[i];
      const entry = this.entries.get(frame.id);
      return !entry || entry.frame !== frame || entry.key !== key;
    };
    if (this.current < animation.frames.length && stale(this.current)) return this.current;
    for (let i = 0; i < animation.frames.length; i++) if (stale(i)) return i;
    return -1;
  }

  private schedule(delay: number): void {
    // Новая правка отодвигает пересчёт: считать имеет смысл, когда правки стихли.
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.work(), delay);
  }

  private work(): void {
    this.timer = null;
    const animation = this.animation;
    if (!animation) return;
    const key = this.keyOf(animation);
    const started = performance.now();
    let changed = false;
    for (let index = this.nextStale(animation, key); index >= 0;) {
      this.render(animation, index, key);
      changed = true;
      index = this.nextStale(animation, key);
      if (index >= 0 && performance.now() - started > SLICE_MS) {
        this.schedule(0);
        break;
      }
    }
    if (!changed) return;
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  private render(animation: Animation, index: number, key: string): void {
    const doc = frameDocument(animation, index);
    // Тот же композитор, что и у экрана: слои, непрозрачность, объекты и эффекты сходятся сами.
    this.scratch = composite(doc, null, this.scratch);
    const ratio = this.pixelRatio();
    const size = fitThumbnail(doc.width, doc.height, THUMB_MAX_WIDTH * ratio, THUMB_HEIGHT * ratio);
    const thumb = renderThumbnail(
      this.scratch,
      size.width,
      size.height,
      doc.background,
      this.coverage,
    );
    this.entries.set(animation.frames[index].id, { frame: animation.frames[index], key, thumb });
  }
}
