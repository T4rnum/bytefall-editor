import type { Cell } from './cell';
import { type Document, findLayer, setLayerCells } from './document';
import { type CellKey, applyEdits, keyOf } from './grid';
import { type SceneObject, addObject, createObject, findObject, removeObject } from './object';
import { objectMatrix } from './placement';
import { rasterizeObject } from './rasterize';
import { type Selection, clearSelectionEdits, copySelection } from './selection';

/** Вырезает выделенные ячейки из растра слоя в новый объект. null, если в выделении пусто. */
export function groupSelection(
  doc: Document,
  layerId: string,
  selection: Selection,
  name: string = `Объект ${doc.objects.length + 1}`,
): { doc: Document; object: SceneObject } | null {
  const layer = findLayer(doc, layerId);
  if (!layer) return null;
  const clip = copySelection(layer.cells, selection);
  if (clip.cells.size === 0) return null;
  const { x, y } = selection.bounds;
  const object = createObject({ name, layerId, x, y, cells: clip.cells });
  const raster = applyEdits(layer.cells, clearSelectionEdits(layer.cells, selection));
  return { doc: addObject(setLayerCells(doc, layerId, raster), object), object };
}

/**
 * Впечатывает объект в растр его слоя и удаляет объект. Повёрнутый и отмасштабированный объект
 * впечатывается так же, как уходит в текст: через `rasterizeObject`. Ячейки за холстом теряются.
 */
export function ungroupObject(doc: Document, id: string): Document {
  const obj = findObject(doc, id);
  if (!obj) return doc;
  const layer = findLayer(doc, obj.layerId);
  if (!layer) return removeObject(doc, id);
  const edits = new Map<CellKey, Cell | null>();
  const canvas = { x: 0, y: 0, w: doc.width, h: doc.height };
  rasterizeObject(obj, objectMatrix(doc, obj), canvas, (x, y, cell) =>
    edits.set(keyOf(x, y), cell),
  );
  const baked = setLayerCells(doc, obj.layerId, applyEdits(layer.cells, edits));
  return removeObject(baked, id);
}
