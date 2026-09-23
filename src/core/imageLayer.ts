import { type Animation, mapFrames, resizeAnimation } from './animation';
import type { Cell } from './cell';
import { type Document, MAX_LAYERS, addLayer, createLayer, newId, setLayerCells } from './document';
import { type CellKey, keyOf, xOf, yOf } from './grid';

/** Сетка из конвертера: ячейки от (0, 0), размер — в ячейках. */
export interface ConvertedImage {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly cells: ReadonlyMap<CellKey, Cell>;
}

/** Куда встанет картинка: по центру холста, либо холст подгоняется под неё. */
export function imagePlacement(
  doc: { readonly width: number; readonly height: number },
  image: { readonly width: number; readonly height: number },
  fitCanvas: boolean,
): { x: number; y: number } {
  if (fitCanvas) return { x: 0, y: 0 };
  return {
    x: Math.floor((doc.width - image.width) / 2),
    y: Math.floor((doc.height - image.height) / 2),
  };
}

/** Есть ли в документе хоть что-то: пустой холст разумно подогнать под картинку. */
export const isDocumentEmpty = (anim: Animation): boolean =>
  anim.frames.every((f) => f.objects.length === 0 && f.layers.every((l) => l.cells.size === 0));

/**
 * Картинка из конвертера новым слоем. Слои общие для всех кадров, поэтому слой появляется в
 * каждом кадре, а символы — только в кадре `frameIndex`. С `fitCanvas` холст всех кадров
 * становится размером с картинку; иначе картинка встаёт по центру, и всё, что вышло за холст,
 * обрезается.
 */
export function addImageLayer(
  anim: Animation,
  frameIndex: number,
  image: ConvertedImage,
  fitCanvas: boolean,
): { animation: Animation; layerId: string } {
  if (anim.frames[0].layers.length >= MAX_LAYERS) {
    throw new Error(`At most ${MAX_LAYERS} layers`);
  }
  const layer = createLayer(image.name, newId('layer'));
  const sized = fitCanvas ? resizeAnimation(anim, image.width, image.height) : anim;
  const place = (doc: Document): Map<CellKey, Cell> => {
    const at = imagePlacement(doc, image, fitCanvas);
    const cells = new Map<CellKey, Cell>();
    for (const [key, cell] of image.cells) {
      const x = xOf(key) + at.x;
      const y = yOf(key) + at.y;
      if (x >= 0 && y >= 0 && x < doc.width && y < doc.height) cells.set(keyOf(x, y), cell);
    }
    return cells;
  };
  const animation = mapFrames(sized, (doc, index) => {
    const withLayer = addLayer(doc, layer);
    return index === frameIndex ? setLayerCells(withLayer, layer.id, place(doc)) : withLayer;
  });
  return { animation, layerId: layer.id };
}
