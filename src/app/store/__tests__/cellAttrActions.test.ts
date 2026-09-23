import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { createDocument, setLayerCells } from '../../../core/document';
import { applyEdits, emptyGrid, getCell, keyOf } from '../../../core/grid';
import { selectionFromRect } from '../../../core/selection';
import { deserialize, serialize } from '../../../core/serialization';
import {
  removeCellAttrAction,
  selectCellsWithAttrAction,
  setCellAttrAction,
} from '../cellAttrActions';
import { updateLayerAction } from '../documentActions';
import { useDocumentStore } from '../documentStore';
import { useEditorStore } from '../editorStore';

const cells = () => useDocumentStore.getState().doc.layers[0].cells;

/** Ряд 4×1: две стены, пустота, вода со своим свойством. */
function setup(): void {
  const doc = createDocument({ width: 4, height: 1 });
  const grid = applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), makeCell('#')],
      [keyOf(1, 0), makeCell('#')],
      [keyOf(3, 0), makeCell('~', '#0000ff', null, { depth: 2 })],
    ]),
  );
  useDocumentStore
    .getState()
    .replaceAnimation(createAnimation(setLayerCells(doc, doc.layers[0].id, grid)));
  useEditorStore.setState({ selection: selectionFromRect({ x: 0, y: 0, w: 4, h: 1 }, 4, 1) });
}

describe('свойства выделенных ячеек', () => {
  beforeEach(setup);

  it('добавление ставит свойство всем непустым выделенным ячейкам одной записью истории', () => {
    const before = useDocumentStore.getState().history.past.length;
    setCellAttrAction(' wall ', 'true');
    expect(getCell(cells(), 0, 0)?.attrs).toEqual({ wall: true });
    expect(getCell(cells(), 3, 0)?.attrs).toEqual({ depth: 2, wall: true });
    expect(useDocumentStore.getState().history.past.length).toBe(before + 1);
    useDocumentStore.getState().undo();
    expect(getCell(cells(), 0, 0)?.attrs).toBeUndefined();
  });

  it('правка значения в строке меняет его только там, где свойство есть', () => {
    setCellAttrAction('depth', '5', true);
    expect(getCell(cells(), 3, 0)?.attrs).toEqual({ depth: 5 });
    expect(getCell(cells(), 0, 0)?.attrs).toBeUndefined();
  });

  it('удаление убирает свойство у выделенных', () => {
    removeCellAttrAction('depth');
    expect(getCell(cells(), 3, 0)).toEqual({ glyph: '~', fg: '#0000ff', bg: null });
  });

  it('неверное имя и отсутствие выделения ничего не меняют', () => {
    const before = cells();
    setCellAttrAction('   ', '1');
    setCellAttrAction('__proto__', '1');
    useEditorStore.setState({ selection: null });
    setCellAttrAction('wall', 'true');
    expect(cells()).toBe(before);
  });

  it('на запертом слое свойства не меняются', () => {
    const layerId = useDocumentStore.getState().doc.layers[0].id;
    updateLayerAction(layerId, { locked: true }, 'lock');
    const before = cells();
    setCellAttrAction('wall', 'true');
    expect(cells()).toBe(before);
  });

  it('«выделить все с этим свойством» выделяет ровно их', () => {
    useEditorStore.setState({ selection: null });
    selectCellsWithAttrAction('depth');
    const selection = useEditorStore.getState().selection;
    expect(selection?.size).toBe(1);
    expect(selection?.bounds).toEqual({ x: 3, y: 0, w: 1, h: 1 });
  });

  it('свойства переживают сохранение в файл и открытие', () => {
    setCellAttrAction('wall', 'true');
    const reopened = deserialize(serialize(useDocumentStore.getState().animation));
    const grid = reopened.frames[0].layers[0].cells;
    expect(getCell(grid, 1, 0)?.attrs).toEqual({ wall: true });
    expect(getCell(grid, 3, 0)?.attrs).toEqual({ depth: 2, wall: true });
  });
});
