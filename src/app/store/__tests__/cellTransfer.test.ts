import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { keyOf } from '../../../core/grid';
import { glyphAt, placedGlyphs } from '../../../core/glyphPick';
import { addObject, createObject, findObject } from '../../../core/object';
import { selectionFromRect } from '../../../core/selection';
import {
  extractGlyphsAction,
  joinSelectionToObjectAction,
  recolorSelectionAction,
} from '../cellTransferActions';
import { useDocumentStore } from '../documentStore';
import { useEditorStore } from '../editorStore';
import { toggleEditModeAction } from '../objectEditActions';

const state = () => useDocumentStore.getState();
const editor = () => useEditorStore.getState();
const object = () => findObject(state().doc, 'o')!;
const layerCells = () => state().doc.layers[0].cells;

/** Строка «ABC» объектом в (4, 2); на слое под ней «xy» в (2, 2) и (3, 2). */
function setup() {
  let doc = createDocument({ width: 16, height: 8 });
  const layer = doc.layers[0];
  const cells = new Map([...'ABC'].map((ch, x) => [keyOf(x, 0), makeCell(ch)]));
  doc = {
    ...doc,
    layers: [
      {
        ...layer,
        cells: new Map([
          [keyOf(2, 2), makeCell('x')],
          [keyOf(3, 2), makeCell('y')],
        ]),
      },
    ],
  };
  doc = addObject(doc, createObject({ name: 'o', id: 'o', layerId: layer.id, x: 4, y: 2, cells }));
  state().replaceAnimation(createAnimation(doc));
  state().setActiveLayer(layer.id);
  useEditorStore.setState({ selection: null, editingObjectId: null, glyphSelection: [] });
  editor().setSelectedObject('o');
  editor().setFg('#ff0000');
  editor().setBg(null);
}

const visibleAt = (x: number, y: number) =>
  glyphAt(placedGlyphs(state().doc, object(), 0), { x: x + 0.5, y: y + 0.5 });

describe('перенос между слоем и объектом', () => {
  beforeEach(setup);

  it('Ctrl+J: ячейки слоя уходят в объект на то же место, начало переезжает', () => {
    editor().setSelection(selectionFromRect({ x: 2, y: 2, w: 2, h: 1 }, 16, 8));
    joinSelectionToObjectAction();
    expect(layerCells().size).toBe(0);
    expect(object().cells.size).toBe(5);
    expect(object().transform).toMatchObject({ x: 2, y: 2 });
    expect(object().cells.get(visibleAt(2, 2)!)?.glyph).toBe('x');
    expect(editor().selection).toBeNull();
    state().undo();
    expect(layerCells().size).toBe(2);
    expect(object().cells.size).toBe(3);
  });

  it('Ctrl+Shift+J: выделенные символы — в слой под собой, объект остаётся', () => {
    toggleEditModeAction();
    editor().setGlyphSelection([keyOf(1, 0)]);
    extractGlyphsAction();
    expect(layerCells().get(keyOf(5, 2))?.glyph).toBe('B');
    expect([...object().cells.keys()]).toEqual([keyOf(0, 0), keyOf(2, 0)]);
    expect(editor().glyphSelection).toEqual([]);
    expect(editor().editingObjectId).toBe('o');
  });

  it('перекраска: символы в правке и ячейки слоя вне её', () => {
    toggleEditModeAction();
    editor().setGlyphSelection([keyOf(0, 0), keyOf(2, 0)]);
    recolorSelectionAction();
    expect([...object().cells.values()].map((c) => `${c.glyph}${c.fg}`)).toEqual([
      'A#ff0000',
      'B#ffffff',
      'C#ff0000',
    ]);
    toggleEditModeAction();
    editor().setSelection(selectionFromRect({ x: 2, y: 2, w: 1, h: 1 }, 16, 8));
    recolorSelectionAction();
    expect(layerCells().get(keyOf(2, 2))).toEqual(makeCell('x', '#ff0000'));
    expect(layerCells().get(keyOf(3, 2))?.fg).not.toBe('#ff0000');
  });
});
