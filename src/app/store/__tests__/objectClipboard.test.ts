import { beforeEach, describe, expect, it } from 'vitest';
import { addFrame, createAnimation, frameDocument } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { addLayer, createDocument, createLayer } from '../../../core/document';
import { applyEdits, emptyGrid, keyOf } from '../../../core/grid';
import { addObject, createObject, findObject } from '../../../core/object';
import { selectionFromRect } from '../../../core/selection';
import { copyAction, cutAction, pasteAction } from '../clipboardActions';
import { updateLayerAction } from '../documentActions';
import { useDocumentStore } from '../documentStore';
import { useEditorStore } from '../editorStore';
import { moveSelectedObjectToLayerAction, stepSelectedObjectLayerAction } from '../objectActions';

const doc = () => useDocumentStore.getState().doc;
const editor = () => useEditorStore.getState();

/** Два слоя, два кадра; в первом кадре на нижнем слое объект «hero» в (3, 2). */
function setup() {
  const base = createDocument({ width: 16, height: 8 });
  const top = createLayer('Верх');
  const bottomId = base.layers[0].id;
  const cells = applyEdits(emptyGrid(), new Map([[keyOf(0, 0), makeCell('@')]]));
  const hero = createObject({ name: 'hero', layerId: bottomId, x: 3, y: 2, cells });
  const withObject = addObject(addLayer(base, top), hero);
  const animation = addFrame(createAnimation(withObject), 0, 'empty');
  useDocumentStore.getState().replaceAnimation(animation);
  useDocumentStore.getState().setActiveLayer(bottomId);
  useEditorStore.setState({
    tool: 'object',
    selectedObjectId: hero.id,
    selection: null,
    clipboard: null,
  });
  return { hero, bottomId, topId: top.id };
}

describe('копирование и вставка объекта', () => {
  beforeEach(setup);

  it('с инструментом объектов Ctrl+C кладёт в буфер объект', () => {
    copyAction();
    expect(editor().clipboard).toMatchObject({ kind: 'object', object: { name: 'hero' } });
  });

  it('в другой кадр объект встаёт на то же место, с тем же id и выбранным', () => {
    const { hero } = setup();
    copyAction();
    useDocumentStore.getState().setFrameIndex(1);
    pasteAction();
    const pasted = findObject(doc(), hero.id);
    expect(pasted).toMatchObject({ x: 3, y: 2, name: 'hero' });
    expect(editor().selectedObjectId).toBe(hero.id);
    expect(editor().tool).toBe('object');
  });

  it('в тот же кадр вставляется копия с новым id, оригинал на месте', () => {
    const { hero } = setup();
    copyAction();
    pasteAction();
    expect(doc().objects).toHaveLength(2);
    expect(findObject(doc(), hero.id)).toBeDefined();
    expect(editor().selectedObjectId).not.toBe(hero.id);
  });

  it('вставка идёт на активный слой: так объект и переносят между слоями', () => {
    const { topId } = setup();
    copyAction();
    useDocumentStore.getState().setFrameIndex(1);
    useDocumentStore.getState().setActiveLayer(topId);
    pasteAction();
    expect(doc().objects[0].layerId).toBe(topId);
  });

  it('на запертый слой не вставляется ничего', () => {
    const { bottomId } = setup();
    copyAction();
    updateLayerAction(bottomId, { locked: true }, 'lock');
    pasteAction();
    expect(doc().objects).toHaveLength(1);
  });

  it('вырезание убирает объект одной записью истории, отмена его возвращает', () => {
    const { hero } = setup();
    cutAction();
    expect(findObject(doc(), hero.id)).toBeUndefined();
    expect(editor().clipboard?.kind).toBe('object');
    useDocumentStore.getState().undo();
    expect(findObject(doc(), hero.id)).toBeDefined();
  });

  it('запертый объект можно скопировать, но не вырезать', () => {
    const { hero } = setup();
    const locked = { ...findObject(doc(), hero.id)!, locked: true };
    useDocumentStore.getState().commitStructural('lock', { ...doc(), objects: [locked] });
    cutAction();
    expect(findObject(doc(), hero.id)).toBeDefined();
    copyAction();
    expect(editor().clipboard?.kind).toBe('object');
  });

  it('с другим инструментом Ctrl+C копирует ячейки, а не объект', () => {
    setup();
    useEditorStore.setState({
      tool: 'select',
      selection: selectionFromRect({ x: 0, y: 0, w: 2, h: 2 }, 16, 8),
    });
    copyAction();
    expect(editor().clipboard?.kind).toBe('cells');
  });
});

describe('перенос объекта на другой слой', () => {
  beforeEach(setup);

  it('выбором слоя', () => {
    const { hero, topId } = setup();
    moveSelectedObjectToLayerAction(topId);
    expect(findObject(doc(), hero.id)?.layerId).toBe(topId);
  });

  it('шагом вверх и вниз, а на крайнем слое — никуда', () => {
    const { hero, bottomId, topId } = setup();
    stepSelectedObjectLayerAction(1);
    expect(findObject(doc(), hero.id)?.layerId).toBe(topId);
    stepSelectedObjectLayerAction(1);
    expect(findObject(doc(), hero.id)?.layerId).toBe(topId);
    stepSelectedObjectLayerAction(-1);
    expect(findObject(doc(), hero.id)?.layerId).toBe(bottomId);
  });

  it('запертый слой объект не принимает', () => {
    const { hero, bottomId, topId } = setup();
    updateLayerAction(topId, { locked: true }, 'lock');
    moveSelectedObjectToLayerAction(topId);
    expect(findObject(doc(), hero.id)?.layerId).toBe(bottomId);
  });

  it('перенос касается только текущего кадра: объекты у каждого кадра свои', () => {
    const { hero, topId } = setup();
    moveSelectedObjectToLayerAction(topId);
    const second = frameDocument(useDocumentStore.getState().animation, 1);
    expect(second.objects).toHaveLength(0);
    expect(findObject(doc(), hero.id)?.layerId).toBe(topId);
  });
});
