import { describe, expect, it } from 'vitest';
import { type Affine, applyAffine } from '../affine';
import { createAnimation } from '../animation';
import { makeCell } from '../cell';
import { type Document, addLayer, createDocument, createLayer, duplicateLayer } from '../document';
import { applyEdits, emptyGrid, keyOf } from '../grid';
import {
  canSetParent,
  detachedCopy,
  moveInDocument,
  objectOutline,
  removeLayerKeepingChildren,
  removeObject,
  setParent,
} from '../hierarchy';
import { addObject, createObject, findObject, transformObject } from '../object';
import { objectMatrix } from '../placement';
import { deserialize, serialize } from '../serialization';

const pair = () =>
  applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), makeCell('a')],
      [keyOf(1, 0), makeCell('b')],
    ]),
  );

/**
 * Повёрнутый и увеличенный «кузов» и «колесо» рядом, оба пока в корне. Масштаб кузова
 * равномерный: под ним перенос в иерархию точный, без перекоса.
 */
function setup() {
  let doc = createDocument({ width: 32, height: 32 });
  const top = createLayer('top');
  doc = addLayer(doc, top);
  const body = createObject({
    name: 'body',
    layerId: doc.layers[0].id,
    x: 10,
    y: 10,
    cells: pair(),
    id: 'body',
  });
  const wheel = createObject({
    name: 'wheel',
    layerId: top.id,
    x: 14,
    y: 12,
    cells: pair(),
    id: 'wheel',
  });
  doc = addObject(addObject(doc, body), wheel);
  doc = transformObject(doc, 'body', { rot: 30, sx: 2, sy: 2 });
  return { doc, topId: top.id };
}

const worldOf = (doc: Document, id: string): Affine => objectMatrix(doc, findObject(doc, id)!);

/** Объект стоит там же: центры его ячеек на экране не сдвинулись. */
function expectSamePlace(before: Document, after: Document, id: string): void {
  for (const [x, y] of [
    [0.5, 0.5],
    [1.5, 0.5],
  ]) {
    const a = applyAffine(worldOf(before, id), x, y);
    const b = applyAffine(worldOf(after, id), x, y);
    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
  }
}

describe('setParent', () => {
  it('ребёнок остаётся на месте, а дальше едет и крутится вместе с родителем', () => {
    const { doc } = setup();
    const parented = setParent(doc, 'wheel', 'body');
    expect(findObject(parented, 'wheel')?.parentId).toBe('body');
    expectSamePlace(doc, parented, 'wheel');

    const turned = transformObject(parented, 'body', { rot: 120 });
    const moved = applyAffine(worldOf(turned, 'wheel'), 0.5, 0.5);
    const before = applyAffine(worldOf(parented, 'wheel'), 0.5, 0.5);
    expect(Math.hypot(moved.x - before.x, moved.y - before.y)).toBeGreaterThan(1);
  });

  it('под неравно растянутым родителем опора встаёт точно, остальное — с малым перекосом', () => {
    const { doc } = setup();
    const stretched = transformObject(doc, 'body', { sy: 1 });
    const parented = setParent(stretched, 'wheel', 'body');
    const wheel = findObject(parented, 'wheel')!;
    const pivot = (d: Document) =>
      applyAffine(worldOf(d, 'wheel'), wheel.transform.px, wheel.transform.py);
    expect(pivot(parented).x).toBeCloseTo(pivot(stretched).x, 5);
    expect(pivot(parented).y).toBeCloseTo(pivot(stretched).y, 5);
    const a = applyAffine(worldOf(stretched, 'wheel'), 0.5, 0.5);
    const b = applyAffine(worldOf(parented, 'wheel'), 0.5, 0.5);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(0.5);
  });

  it('отвязка тоже не сдвигает объект', () => {
    const { doc } = setup();
    const parented = setParent(doc, 'wheel', 'body');
    const freed = setParent(parented, 'wheel', null);
    expect(findObject(freed, 'wheel')?.parentId).toBeNull();
    expectSamePlace(parented, freed, 'wheel');
  });

  it('цепочка не замыкается: ни на себя, ни на потомка', () => {
    const { doc } = setup();
    const parented = setParent(doc, 'wheel', 'body');
    expect(canSetParent(parented, 'body', 'wheel')).toBe(false);
    expect(canSetParent(parented, 'body', 'body')).toBe(false);
    expect(canSetParent(parented, 'body', 'nobody')).toBe(false);
    expect(setParent(parented, 'body', 'wheel')).toBe(parented);
  });
});

describe('удаление в иерархии', () => {
  it('дети удалённого объекта переходят к его родителю и не двигаются', () => {
    let { doc } = setup();
    const hub = createObject({
      name: 'hub',
      layerId: doc.layers[0].id,
      x: 20,
      y: 20,
      cells: pair(),
      id: 'hub',
    });
    doc = addObject(doc, hub);
    doc = setParent(setParent(doc, 'body', 'hub'), 'wheel', 'body');
    const removed = removeObject(doc, 'body');
    expect(findObject(removed, 'body')).toBeUndefined();
    expect(findObject(removed, 'wheel')?.parentId).toBe('hub');
    expectSamePlace(doc, removed, 'wheel');
  });

  it('удаление слоя отпускает детей с других слоёв, не сдвигая их', () => {
    const { doc } = setup();
    const parented = setParent(doc, 'wheel', 'body');
    const bodyLayer = doc.layers[0].id;
    const removed = removeLayerKeepingChildren(parented, bodyLayer);
    expect(findObject(removed, 'body')).toBeUndefined();
    expect(findObject(removed, 'wheel')?.parentId).toBeNull();
    expectSamePlace(parented, removed, 'wheel');
  });

  it('файл после удаления родителя читается', () => {
    const { doc } = setup();
    const removed = removeObject(setParent(doc, 'wheel', 'body'), 'body');
    expect(() => deserialize(serialize(createAnimation(removed)))).not.toThrow();
  });

  it('ссылка на пропавшего родителя в файл не пишется', () => {
    const { doc } = setup();
    const dangling = {
      ...doc,
      objects: doc.objects.map((o) => (o.id === 'wheel' ? { ...o, parentId: 'ghost' } : o)),
    };
    const reopened = deserialize(serialize(createAnimation(dangling)));
    expect(reopened.frames[0].objects.find((o) => o.id === 'wheel')?.parentId).toBeNull();
  });
});

describe('копия и перенос', () => {
  it('копия для буфера обмена — без родителя, на том же месте', () => {
    const { doc } = setup();
    const parented = setParent(doc, 'wheel', 'body');
    const copy = detachedCopy(parented, findObject(parented, 'wheel')!);
    expect(copy.parentId).toBeNull();
    const alone = { ...parented, objects: [copy] };
    const a = applyAffine(worldOf(parented, 'wheel'), 0.5, 0.5);
    const b = applyAffine(objectMatrix(alone, copy), 0.5, 0.5);
    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
  });

  it('ребёнок повёрнутого родителя едет за курсором, а не вдоль осей родителя', () => {
    const { doc } = setup();
    const parented = setParent(doc, 'wheel', 'body');
    const moved = moveInDocument(parented, 'wheel', 3, -2);
    const a = applyAffine(worldOf(parented, 'wheel'), 0.5, 0.5);
    const b = applyAffine(worldOf(moved, 'wheel'), 0.5, 0.5);
    expect(b.x - a.x).toBeCloseTo(3, 5);
    expect(b.y - a.y).toBeCloseTo(-2, 5);
    expect(Math.abs(findObject(moved, 'wheel')!.transform.dx)).toBeLessThanOrEqual(0.5);
  });

  it('копия слоя держит родство внутри себя', () => {
    let { doc } = setup();
    const layerId = doc.layers[0].id;
    const tail = createObject({ name: 'tail', layerId, x: 0, y: 0, cells: pair(), id: 'tail' });
    doc = setParent(addObject(doc, tail), 'tail', 'body');
    const copy = duplicateLayer(doc, layerId);
    const copies = copy.objects.filter((o) => o.layerId === copy.layers[1].id);
    const body2 = copies.find((o) => o.name === 'body')!;
    expect(copies.find((o) => o.name === 'tail')?.parentId).toBe(body2.id);
  });
});

describe('objectOutline', () => {
  it('дети идут под родителем с отступом, даже с другого слоя', () => {
    const { doc } = setup();
    const parented = setParent(doc, 'wheel', 'body');
    // Колесо на верхнем слое, кузов на нижнем: по отрисовке колесо выше, по родству — под кузовом.
    expect(objectOutline(parented).map((r) => [r.object.id, r.depth])).toEqual([
      ['body', 0],
      ['wheel', 1],
    ]);
    expect(objectOutline(doc).map((r) => [r.object.id, r.depth])).toEqual([
      ['wheel', 0],
      ['body', 0],
    ]);
  });

  it('объект из замкнутой цепочки не теряется', () => {
    const { doc } = setup();
    const looped = {
      ...doc,
      objects: doc.objects.map((o) => ({ ...o, parentId: o.id === 'body' ? 'wheel' : 'body' })),
    };
    expect(objectOutline(looped)).toHaveLength(2);
  });
});
