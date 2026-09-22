import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimation } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { editsFromPoints, getCell, keyOf } from '../../../core/grid';
import { type Selection, selectionFromRect } from '../../../core/selection';
import { useDocumentStore } from '../../store/documentStore';
import { useEditorStore } from '../../store/editorStore';
import { buildToolEnv } from '../env';

const WIDTH = 8;
const HEIGHT = 8;

/** Левый верхний угол холста: всё остальное для правок закрыто. */
const corner = (): Selection => selectionFromRect({ x: 0, y: 0, w: 2, h: 2 }, WIDTH, HEIGHT)!;

const stroke = () =>
  editsFromPoints(
    [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ],
    makeCell('#'),
  );

const cells = () => useDocumentStore.getState().doc.layers[0].cells;

describe('выделение как маска правок', () => {
  beforeEach(() => {
    useDocumentStore
      .getState()
      .replaceAnimation(createAnimation(createDocument({ width: WIDTH, height: HEIGHT })));
    useEditorStore.setState({ tool: 'pencil', selection: null, preview: null });
  });

  it('без выделения правки проходят целиком', () => {
    buildToolEnv().commit(stroke(), 'Pencil');
    expect(getCell(cells(), 0, 0)?.glyph).toBe('#');
    expect(getCell(cells(), 5, 5)?.glyph).toBe('#');
  });

  it('с выделением до слоя доходят только его ячейки', () => {
    useEditorStore.setState({ selection: corner() });
    buildToolEnv().commit(stroke(), 'Pencil');
    expect(getCell(cells(), 0, 0)?.glyph).toBe('#');
    expect(getCell(cells(), 5, 5)).toBeUndefined();
  });

  it('превью обрезается так же, иначе кисть обещала бы невыполнимое', () => {
    useEditorStore.setState({ selection: corner() });
    buildToolEnv().setPreview(stroke());
    const preview = useEditorStore.getState().preview;
    expect([...preview!.edits.keys()]).toEqual([keyOf(0, 0)]);
  });

  it('правка целиком вне выделения не попадает в историю', () => {
    useEditorStore.setState({ selection: corner() });
    const before = useDocumentStore.getState().history.past.length;
    buildToolEnv().commit(editsFromPoints([{ x: 5, y: 5 }], makeCell('#')), 'Pencil');
    expect(useDocumentStore.getState().history.past.length).toBe(before);
    expect(cells().size).toBe(0);
  });

  it('инструменты выделения выведены из правила: перенос уходит за прежнюю маску', () => {
    useEditorStore.setState({ tool: 'select', selection: corner() });
    buildToolEnv().commit(stroke(), 'Move selection');
    expect(getCell(cells(), 5, 5)?.glyph).toBe('#');
  });
});
