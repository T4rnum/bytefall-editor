import type { RgbaImage } from '../../core/quantize';

/**
 * Больше этого по длинной стороне картинка уменьшается ещё при декодировании. Холст — до 1024
 * ячеек, конвертеру хватает двух пикселей на ячейку, а фото с телефона в 48 мегапикселей
 * заняло бы в памяти почти двести мегабайт.
 */
export const MAX_IMAGE_SIDE = 2048;

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif'];

/** Картинка ли это: по типу, а если браузер его не сказал — по расширению. */
export function isImageFile(file: { readonly name: string; readonly type: string }): boolean {
  if (file.type.startsWith('image/')) return true;
  const name = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Имя файла без расширения: так называется слой с картинкой. */
export function imageName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName) || 'Картинка';
}

/**
 * Декодирует файл картинки в RGBA. Декодер браузера сам уменьшает большую картинку с хорошим
 * сглаживанием; у анимированной берётся первый кадр.
 */
export async function decodeImage(file: Blob): Promise<RgbaImage> {
  const probe = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(probe.width, probe.height));
  const width = Math.max(1, Math.round(probe.width * scale));
  const height = Math.max(1, Math.round(probe.height * scale));
  const bitmap =
    scale < 1
      ? await createImageBitmap(file, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: 'high',
        })
      : probe;
  if (bitmap !== probe) probe.close();
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    ctx.drawImage(bitmap, 0, 0);
    return { width, height, data: ctx.getImageData(0, 0, width, height).data };
  } finally {
    bitmap.close();
  }
}
