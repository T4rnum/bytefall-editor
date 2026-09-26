import { sheetAtlas, sheetLayouts } from '../../core/spriteSheet';
import { type ZipEntry, utf8, writeZip } from '../../core/zip';
import type { RenderedFrame } from './animationExport';

/** Холст нужного размера и PNG из него: кодирует браузер. */
async function png(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('браузер не дал Canvas 2D');
  draw(ctx);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('не удалось закодировать PNG'))),
      'image/png',
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

function putFrame(ctx: CanvasRenderingContext2D, frame: RenderedFrame, x: number, y: number): void {
  const pixels = new Uint8ClampedArray(
    frame.data.buffer,
    frame.data.byteOffset,
    frame.data.byteLength,
  );
  ctx.putImageData(new ImageData(pixels, frame.width, frame.height), x, y);
}

const json = (value: unknown): Uint8Array => utf8(JSON.stringify(value, null, 2));

/**
 * Листы спрайтов с атласами JSON одним архивом: `имя-0.png` и `имя-0.json`, дальше `-1`, если
 * кадры не влезли в один лист (`core/spriteSheet.ts`).
 */
export async function sheetArchive(
  frames: readonly RenderedFrame[],
  name: string,
): Promise<Uint8Array> {
  const first = frames[0];
  if (!first) throw new Error('нечего экспортировать');
  const size = { w: first.width, h: first.height };
  const durations = frames.map((f) => f.delay);
  const entries: ZipEntry[] = [];
  for (const [i, layout] of sheetLayouts(frames.length, size.w, size.h).entries()) {
    const image = `${name}-${i}.png`;
    const data = await png(layout.columns * size.w, layout.rows * size.h, (ctx) =>
      layout.frames.forEach((index, k) =>
        putFrame(
          ctx,
          frames[index],
          (k % layout.columns) * size.w,
          Math.floor(k / layout.columns) * size.h,
        ),
      ),
    );
    entries.push({ name: image, data });
    entries.push({
      name: `${name}-${i}.json`,
      data: json(sheetAtlas(layout, size, durations, name, image)),
    });
  }
  return writeZip(entries, new Date());
}

/**
 * Кадры отдельными PNG одним архивом: `имя-0000.png` и так далее, рядом `имя.json` с частотой и
 * длительностью каждого кадра — движку незачем угадывать тайминг по именам.
 */
export async function frameArchive(
  frames: readonly RenderedFrame[],
  name: string,
  fps: number,
): Promise<Uint8Array> {
  const digits = Math.max(4, String(frames.length - 1).length);
  const files = frames.map((_, i) => `${name}-${String(i).padStart(digits, '0')}.png`);
  const entries: ZipEntry[] = [];
  for (const [i, frame] of frames.entries()) {
    entries.push({
      name: files[i],
      data: await png(frame.width, frame.height, (ctx) => putFrame(ctx, frame, 0, 0)),
    });
  }
  const timing = { fps, frames: frames.map((f, i) => ({ file: files[i], duration: f.delay })) };
  entries.push({ name: `${name}.json`, data: json(timing) });
  return writeZip(entries, new Date());
}
