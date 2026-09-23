import { makeCell } from '../../cell';
import { createDocument, setLayerCells } from '../../document';
import type { Rect } from '../../geometry';
import { applyEdits, editsFromPoints, emptyGrid } from '../../grid';
import { type Selection, selectionFromRect } from '../../selection';

/** Три ячейки уголком: (2, 2), (3, 2), (2, 3). */
export const cornerPoints = [
  { x: 2, y: 2 },
  { x: 3, y: 2 },
  { x: 2, y: 3 },
];

/** Прямоугольное выделение на холсте 8×8: у объектов свой предмет теста, не форма выделения. */
export const rectSel = (rect: Rect): Selection => selectionFromRect(rect, 8, 8)!;

/** Документ 8×8 с тремя красными `#` уголком на первом слое. */
export function setupObjectDoc() {
  const doc = createDocument({ width: 8, height: 8 });
  const layerId = doc.layers[0].id;
  const cells = applyEdits(emptyGrid(), editsFromPoints(cornerPoints, makeCell('#', '#ff0000')));
  return { doc: setLayerCells(doc, layerId, cells), layerId };
}
