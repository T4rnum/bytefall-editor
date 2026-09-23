import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimation, createFrame } from '../../../core/animation';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { keyOf } from '../../../core/grid';
import { addObject, createObject, findObject, moveObject } from '../../../core/object';
import { findTrack, setKey } from '../../../core/tracks';
import { useDocumentStore } from '../documentStore';
import { useEditorStore } from '../editorStore';
import { deleteSelectedKeysAction, keySelectedObjectAction, toggleKeyAction } from '../keyActions';
import { setSceneDurationAction, stepKeyAction } from '../timeActions';

const position = { node: 'object', id: 'ball', property: 'position' } as const;

/** Два кадра по 100 мс и мяч, который за секунду катится из (1, 1) в (5, 1). */
function load(): void {
  const base = createDocument({ width: 8, height: 4 });
  const ball = createObject({
    id: 'ball',
    name: 'Ball',
    layerId: base.layers[0].id,
    x: 1,
    y: 1,
    cells: new Map([[keyOf(0, 0), makeCell('O')]]),
  });
  const doc = addObject(base, ball);
  const anim = createAnimation(doc);
  const tracks = setKey(setKey([], position, 0, [1, 1]), position, 1000, [5, 1]);
  useDocumentStore.getState().replaceAnimation({
    ...anim,
    frames: [createFrame(doc.layers, doc.objects), createFrame(doc.layers, doc.objects)],
    tracks,
  });
  useEditorStore.setState({ selectedObjectId: null, selectedKeys: [], isPlaying: false });
}

const ball = () => findObject(useDocumentStore.getState().doc, 'ball')!;

describe('время в сторе', () => {
  beforeEach(load);

  it('сцена на экране — момент указателя, кадр — тот, чьё время идёт', () => {
    useDocumentStore.getState().setTime(500);
    const state = useDocumentStore.getState();
    expect(state.frameIndex).toBe(1);
    expect(ball().transform.x).toBe(3);
    state.setFrameIndex(0);
    expect(useDocumentStore.getState().time).toBe(0);
  });

  it('правка анимированного объекта ставит ключ, отмена возвращает и ключи, и момент', () => {
    const store = useDocumentStore.getState();
    store.setTime(500);
    useDocumentStore.getState().commitStructural('Move', moveObject(store.doc, 'ball', 0, 2));
    const keys = findTrack(useDocumentStore.getState().animation.tracks, position)!.keys;
    expect(keys.map((k) => k.time)).toEqual([0, 500, 1000]);
    expect(ball().transform.y).toBe(3);

    useDocumentStore.getState().setTime(0);
    useDocumentStore.getState().undo();
    expect(useDocumentStore.getState().time).toBe(500);
    expect(findTrack(useDocumentStore.getState().animation.tracks, position)!.keys).toHaveLength(2);
  });

  it('кнопка ключа ставит его и убирает, K ставит трансформ выбранного объекта', () => {
    useDocumentStore.getState().setTime(250);
    toggleKeyAction(position);
    expect(findTrack(useDocumentStore.getState().animation.tracks, position)!.keys).toHaveLength(3);
    toggleKeyAction(position);
    expect(findTrack(useDocumentStore.getState().animation.tracks, position)!.keys).toHaveLength(2);

    useEditorStore.setState({ selectedObjectId: 'ball' });
    keySelectedObjectAction();
    const tracks = useDocumentStore.getState().animation.tracks;
    expect(tracks.map((t) => t.property)).toEqual(['position', 'rotation', 'scale']);
    expect(useDocumentStore.getState().history.past).toHaveLength(3);
  });

  it('Delete удаляет выделенные ключи, без выделения отдаёт клавишу дальше', () => {
    expect(deleteSelectedKeysAction()).toBe(false);
    useEditorStore.setState({ selectedKeys: [{ track: 'object:ball:position', time: 1000 }] });
    expect(deleteSelectedKeysAction()).toBe(true);
    const keys = findTrack(useDocumentStore.getState().animation.tracks, position)!.keys;
    expect(keys.map((k) => k.time)).toEqual([0]);
    expect(useEditorStore.getState().selectedKeys).toEqual([]);
  });

  it('шаг по ключам и длина сцены', () => {
    stepKeyAction(1);
    expect(useDocumentStore.getState().time).toBe(1000);
    stepKeyAction(1);
    expect(useDocumentStore.getState().time).toBe(1000);
    stepKeyAction(-1);
    expect(useDocumentStore.getState().time).toBe(0);

    setSceneDurationAction(1234.5678);
    expect(useDocumentStore.getState().animation.duration).toBe(1234.568);
    setSceneDurationAction(null);
    expect(useDocumentStore.getState().animation.duration).toBeNull();
  });
});
