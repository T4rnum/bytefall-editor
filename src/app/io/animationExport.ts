import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { Animation } from '../../core/animation';
import { type TimeSample, exportSamples, hasMotion } from '../../core/timeline';

/** Кадр в пикселях RGBA сверху вниз, как его отдаёт SceneView.renderPixels. */
export interface RenderedFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array<ArrayBuffer>;
  /** Длительность показа в миллисекундах. */
  readonly delay: number;
}

const MAX_GIF_COLORS = 256;
/** GIF хранит задержку в сотых секунды. */
const GIF_TICK = 10;
/** Кадр короче двух сотых браузеры показывают как десять: такие кадры склеиваются. */
const GIF_MIN_DELAY = 20;

/** Чаще этого GIF кадры не показывает: задержка короче двух сотых становится десятью. */
export const GIF_MAX_FPS = 1000 / GIF_MIN_DELAY;

/**
 * Моменты для GIF: те же, что у экрана, но движение не чаще 50 кадров в секунду и ровной
 * сеткой. 60 к/с после округления до сотых дали бы задержки 20 и 30 мс вперемешку, и анимация
 * шла бы рывками медленнее, чем на экране.
 */
export function gifSamples(anim: Animation): TimeSample[] {
  if (!hasMotion(anim) || anim.fps <= GIF_MAX_FPS) return exportSamples(anim);
  return exportSamples({ ...anim, fps: GIF_MAX_FPS });
}

/**
 * Моменты экспорта в задержки GIF. Округляется до сотых начало каждого кадра, а не каждая
 * задержка: ошибка не копится, и петля длится столько же, сколько сцена. Кадр, который после
 * округления вышел короче двух сотых, отдаёт своё время соседу.
 */
export function gifTimings(
  samples: readonly TimeSample[],
  end: number,
): { time: number; delay: number }[] {
  const at = (t: number): number => Math.round(t / GIF_TICK) * GIF_TICK;
  const finish = at(end);
  const kept: { time: number; start: number }[] = [];
  for (const { time } of samples) {
    const start = at(time);
    const last = kept[kept.length - 1];
    if (last && start - last.start < GIF_MIN_DELAY) continue;
    if (finish - start < GIF_MIN_DELAY && kept.length > 0) continue;
    kept.push({ time, start });
  }
  return kept.map((k, i) => ({
    time: k.time,
    delay: Math.max(GIF_MIN_DELAY, (kept[i + 1]?.start ?? finish) - k.start),
  }));
}

/** Кодирует кадры в зацикленный GIF. Прозрачный холст даёт прозрачный фон. */
export function encodeGif(frames: readonly RenderedFrame[], transparent: boolean): Uint8Array {
  const gif = GIFEncoder();
  const format = transparent ? 'rgba4444' : 'rgb565';
  for (const frame of frames) {
    const palette = quantize(frame.data, MAX_GIF_COLORS, { format, oneBitAlpha: transparent });
    const index = applyPalette(frame.data, palette, format);
    const transparentIndex = transparent ? palette.findIndex((color) => color[3] === 0) : -1;
    gif.writeFrame(index, frame.width, frame.height, {
      palette,
      delay: frame.delay,
      repeat: 0,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
    });
  }
  gif.finish();
  return gif.bytes();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('не удалось закодировать PNG'))),
      'image/png',
    );
  });
}

/** Раскладывает кадры в сетку, близкую к квадрату, и кодирует в PNG. */
export async function buildSpriteSheet(frames: readonly RenderedFrame[]): Promise<Blob> {
  const first = frames[0];
  if (!first) throw new Error('нечего экспортировать');
  const columns = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * first.width;
  canvas.height = rows * first.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('браузер не дал Canvas 2D');
  frames.forEach((frame, i) => {
    const pixels = new Uint8ClampedArray(
      frame.data.buffer,
      frame.data.byteOffset,
      frame.data.byteLength,
    );
    const image = new ImageData(pixels, frame.width, frame.height);
    ctx.putImageData(image, (i % columns) * first.width, Math.floor(i / columns) * first.height);
  });
  return canvasToBlob(canvas);
}
