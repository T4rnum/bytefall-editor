import { describe, expect, it } from 'vitest';
import { createAnimation, frameDocument } from '../animation';
import { makeCell } from '../cell';
import { createDocument } from '../document';
import { applyEdits, emptyGrid, keyOf } from '../grid';
import {
  type SceneObject,
  addObject,
  createObject,
  transformObject,
  updateObject,
} from '../object';
import { deserialize, serialize, toFileObject } from '../serialization';

const cells = () =>
  applyEdits(
    emptyGrid(),
    new Map([
      [keyOf(0, 0), makeCell('A')],
      [keyOf(1, 0), makeCell('B')],
    ]),
  );

/** Повёрнутый родитель с правкой символа и ребёнок. */
const sample = () => {
  let doc = createDocument({ width: 8, height: 8 });
  const layerId = doc.layers[0].id;
  const parent = createObject({ name: 'p', layerId, x: 2, y: 2, cells: cells() });
  const child: SceneObject = {
    ...createObject({ name: 'c', layerId, x: 2, y: 0, cells: cells() }),
    parentId: parent.id,
  };
  doc = addObject(addObject(doc, parent), child);
  doc = transformObject(doc, parent.id, { rot: 30, sx: 1.5, dx: 0.25, px: 0, py: 0 });
  doc = updateObject(doc, parent.id, { overrides: new Map([[keyOf(1, 0), { rot: 90 }]]) });
  return { anim: createAnimation(doc), parent, child };
};

type FileObject = NonNullable<ReturnType<typeof toFileObject>['frames']>[0]['objects'];

/** Файл с подменёнными объектами первого кадра. */
function withObjects(edit: (objects: NonNullable<FileObject>) => unknown[]): string {
  const file = toFileObject(sample().anim);
  const frame = file.frames![0];
  return JSON.stringify({ ...file, frames: [{ ...frame, objects: edit(frame.objects!) }] });
}

describe('формат v5: трансформ объекта', () => {
  it('трансформ, правки символов и родитель переживают сохранение', () => {
    const { anim } = sample();
    const file = toFileObject(anim);
    const [parent, child] = file.frames![0].objects!;
    expect(parent.transform).toMatchObject({ rot: 30, sx: 1.5, dx: 0.25 });
    expect(parent.overrides).toEqual([{ x: 1, y: 0, rot: 90 }]);
    expect(parent).not.toHaveProperty('parentId');
    expect(child.parentId).toBe(parent.id);
    expect(deserialize(serialize(anim))).toEqual(anim);
  });

  it('трансформ вне пределов — ошибка с путём к полю', () => {
    const scaled = withObjects(([p, c]) => [{ ...p, transform: { ...p.transform, sx: 0 } }, c]);
    expect(() => deserialize(scaled)).toThrow(/transform\.sx/);
    const shifted = withObjects(([p, c]) => [{ ...p, transform: { ...p.transform, dy: 3 } }, c]);
    expect(() => deserialize(shifted)).toThrow(/transform\.dy/);
    const fractional = withObjects(([p, c]) => [
      { ...p, transform: { ...p.transform, x: 1.5 } },
      c,
    ]);
    expect(() => deserialize(fractional)).toThrow(/transform\.x/);
  });

  it('объект без трансформа и без позиции не читается', () => {
    const bare = withObjects(([p, c]) => [{ ...p, transform: undefined }, c]);
    expect(() => deserialize(bare)).toThrow(/neither transform nor position/);
  });

  it('неизвестный родитель и цикл — ошибка, а не зависание', () => {
    const orphan = withObjects(([p, c]) => [p, { ...c, parentId: 'nobody' }]);
    expect(() => deserialize(orphan)).toThrow(/unknown parent/);
    const loop = withObjects(([p, c]) => [{ ...p, parentId: c.id }, c]);
    expect(() => deserialize(loop)).toThrow(/its own ancestor/);
    const self = withObjects(([p, c]) => [{ ...p, parentId: p.id }, c]);
    expect(() => deserialize(self)).toThrow(/its own ancestor/);
  });

  it('правка несуществующей ячейки и правка без изменений отбрасываются', () => {
    const text = withObjects(([p, c]) => [
      { ...p, overrides: [...p.overrides!, { x: 7, y: 7, rot: 10 }, { x: 0, y: 0, sx: 1 }] },
      c,
    ]);
    const parent = frameDocument(deserialize(text), 0).objects[0];
    expect([...parent.overrides.keys()]).toEqual([keyOf(1, 0)]);
  });
});
