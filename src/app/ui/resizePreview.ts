import { type ResizeAnchor, resizeOffset } from '../../core/document';

/** Прямоугольник в процентах от общей рамки: так его можно положить прямо в стиль. */
export interface PreviewBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ResizePreview {
  /** Новый холст. */
  readonly canvas: PreviewBox;
  /** Прежнее содержимое на новых координатах: то, что торчит наружу, будет срезано. */
  readonly content: PreviewBox;
  /** Соотношение сторон общей рамки: по нему подбирается размер картинки. */
  readonly aspect: number;
  /** Сколько ячеек прежнего холста уцелеет. */
  readonly kept: { readonly width: number; readonly height: number };
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Раскладка предпросмотра: новый холст и прежнее содержимое в одной рамке. Рамка — объединение
 * обоих прямоугольников, поэтому обрезаемая часть остаётся видимой, а не исчезает за краем.
 * Показать это важнее, чем показать сам рисунок: вопрос у пользователя ровно один — что срежется.
 */
export function resizePreview(
  from: Size,
  width: number,
  height: number,
  anchor: ResizeAnchor,
): ResizePreview {
  const offset = resizeOffset(from, width, height, anchor);
  const x0 = Math.min(0, offset.x);
  const y0 = Math.min(0, offset.y);
  const x1 = Math.max(width, offset.x + from.width);
  const y1 = Math.max(height, offset.y + from.height);
  const boxW = Math.max(1, x1 - x0);
  const boxH = Math.max(1, y1 - y0);
  const box = (x: number, y: number, w: number, h: number): PreviewBox => ({
    left: ((x - x0) / boxW) * 100,
    top: ((y - y0) / boxH) * 100,
    width: (w / boxW) * 100,
    height: (h / boxH) * 100,
  });

  return {
    canvas: box(0, 0, width, height),
    content: box(offset.x, offset.y, from.width, from.height),
    aspect: boxW / boxH,
    kept: {
      width: Math.max(0, Math.min(width, offset.x + from.width) - Math.max(0, offset.x)),
      height: Math.max(0, Math.min(height, offset.y + from.height) - Math.max(0, offset.y)),
    },
  };
}
