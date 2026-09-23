import { beforeEach, describe, expect, it } from 'vitest';
import { addFrame, createAnimation, frameDocument } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { editsFromPoints, getCell } from '../../../core/grid';
import { selectionFromRect } from '../../../core/selection';
import { resizeCanvasAction } from '../documentActions';
import { useDocumentStore } from '../documentStore';
import { useEditorStore } from '../editorStore';

const doc = () => useDocumentStore.getState().doc;

describe('resizeCanvasAction', () => {
  beforeEach(() => {
    const store = useDocumentStore.getState();
    store.replaceAnimation(createAnimation(createDocument({ width: 8, height: 8 })));
    const layerId = doc().layers[0].id;
    store.commitCells(layerId, editsFromPoints([{ x: 7, y: 7 }], makeCell('#')), 'draw');
    useEditorStore.setState({ selection: null });
  });

  it('меняет размер во всех кадрах сразу, иначе они разъедутся', () => {
    const store = useDocumentStore.getState();
    store.commitAnimation('New frame', addFrame(store.animation, 0, 'duplicate'), 1);

    resizeCanvasAction(12, 12, 'top-left');

    const anim = useDocumentStore.getState().animation;
    expect(anim.frames).toHaveLength(2);
    for (let i = 0; i < anim.frames.length; i++) {
      const frame = frameDocument(anim, i);
      expect(frame.width).toBe(12);
      expect(frame.height).toBe(12);
      // Содержимое второго кадра — копия первого, и обрезалось оно так же.
      expect(getCell(frame.layers[0].cells, 7, 7)?.glyph).toBe('#');
    }
  });

  it('якорь сдвигает содержимое в каждом кадре, а не только в первом', () => {
    const store = useDocumentStore.getState();
    store.commitAnimation('New frame', addFrame(store.animation, 0, 'duplicate'), 1);

    resizeCanvasAction(12, 12, 'bottom-right');

    const anim = useDocumentStore.getState().animation;
    for (let i = 0; i < anim.frames.length; i++) {
      const cells = frameDocument(anim, i).layers[0].cells;
      expect(getCell(cells, 11, 11)?.glyph).toBe('#');
      expect(getCell(cells, 7, 7)).toBeUndefined();
    }
  });

  it('якорь доезжает до документа: содержимое сдвигается вместе с холстом', () => {
    resizeCanvasAction(12, 12, 'bottom-right');
    expect(getCell(doc().layers[0].cells, 11, 11)?.glyph).toBe('#');
    expect(getCell(doc().layers[0].cells, 7, 7)).toBeUndefined();
  });

  it('снимает выделение: маска считана по прежнему холсту', () => {
    useEditorStore.setState({ selection: selectionFromRect({ x: 0, y: 0, w: 4, h: 4 }, 8, 8) });
    resizeCanvasAction(12, 12, 'top-left');
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it('тот же размер не создаёт запись истории', () => {
    const before = useDocumentStore.getState().history.past.length;
    resizeCanvasAction(8, 8, 'center');
    expect(useDocumentStore.getState().history.past.length).toBe(before);
  });

  it('отмена возвращает и размер, и срезанные ячейки', () => {
    resizeCanvasAction(4, 4, 'top-left');
    expect(doc().width).toBe(4);
    expect(doc().layers[0].cells.size).toBe(0);

    useDocumentStore.getState().undo();
    expect(doc().width).toBe(8);
    expect(getCell(doc().layers[0].cells, 7, 7)?.glyph).toBe('#');
  });
});
