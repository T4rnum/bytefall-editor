import { describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { composite } from '../compositor';
import { createDocument, setLayerCells } from '../document';
import { applyEdits, editsFromPoints, emptyGrid } from '../grid';
import { bufferToText } from '../text';

describe('bufferToText', () => {
  it('renders rows with spaces for blanks and trims trailing whitespace', () => {
    const doc = createDocument({ width: 4, height: 2 });
    const points = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];
    const cells = applyEdits(emptyGrid(), editsFromPoints(points, makeCell('#')));
    const text = bufferToText(composite(setLayerCells(doc, doc.layers[0].id, cells)));
    expect(text).toBe(' #\n#');
  });
});
