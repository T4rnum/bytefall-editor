import { GIFEncoder, applyPalette, quantize } from 'gifenc';

/** Кадр в пикселях RGBA сверху вниз, как его отдаёт SceneView.renderPixels. */
export interface RenderedFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array<ArrayBuffer>;
  /** Длительность показа в миллисекундах. */
  readonly delay: number;
}

const MAX_GIF_COLORS = 256;

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
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png',
    );
  });
}

/** Раскладывает кадры в сетку, близкую к квадрату, и кодирует в PNG. */
export async function buildSpriteSheet(frames: readonly RenderedFrame[]): Promise<Blob> {
  const first = frames[0];
  if (!first) throw new Error('Nothing to export');
  const columns = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * first.width;
  canvas.height = rows * first.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
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
