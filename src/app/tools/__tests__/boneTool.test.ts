import { describe, expect, it } from 'vitest';
import { makeCell } from '../../../core/cell';
import { createDocument } from '../../../core/document';
import { keyOf } from '../../../core/grid';
import { addObject, createObject, findObject } from '../../../core/object';
import { objectMatrix } from '../../../core/placement';
import { type Bone, boneEnds, isBone } from '../../../core/rig';
import { createBoneTool } from '../boneTool';
import { createObjectTool } from '../objectTool';
import { atPoint, makeToolEnv } from './testEnv';

const blank = () => createDocument({ width: 16, height: 16 });

const endsOf = (doc: ReturnType<typeof blank>, id: string) => {
  const bone = findObject(doc, id) as Bone;
  return boneEnds(objectMatrix(doc, bone), bone.rig);
};

describe('инструмент «Кость»', () => {
  it('нажатие ставит сустав, отпускание — конец; концы тянутся к половине ячейки', () => {
    const { env, calls } = makeToolEnv(blank());
    const tool = createBoneTool();
    tool.onPointerDown?.(env, atPoint(2.1, 3.9));
    tool.onPointerMove?.(env, atPoint(6.2, 4.1));
    expect(calls.draft?.objects).toHaveLength(1);
    tool.onPointerUp?.(env, atPoint(6.2, 4.1));
    expect(calls.draft).toBeNull();
    expect(calls.docCommits.map((c) => c.label)).toEqual(['Add bone']);
    const doc = calls.docCommits[0].doc;
    const [bone] = doc.objects;
    expect(isBone(bone) && bone.rig.length).toBe(4);
    expect(calls.selected).toEqual([bone.id]);
    const { head, tail } = endsOf(doc, bone.id);
    expect([head.x, head.y, tail.x, tail.y]).toEqual([2, 4, 6, 4]);
  });

  it('от конца выбранной кости растёт цепочка, а щелчок без протяжки ничего не создаёт', () => {
    const first = makeToolEnv(blank());
    const tool = createBoneTool();
    tool.onPointerDown?.(first.env, atPoint(2, 4));
    tool.onPointerUp?.(first.env, atPoint(6, 4));
    const doc = first.calls.docCommits[0].doc;
    const upper = doc.objects[0];

    const { env, calls } = makeToolEnv(doc, { selectedObjectId: upper.id });
    tool.onPointerDown?.(env, atPoint(6.1, 4));
    tool.onPointerUp?.(env, atPoint(6.1, 4));
    expect(calls.docCommits).toEqual([]);
    tool.onPointerDown?.(env, atPoint(6.1, 4));
    tool.onPointerUp?.(env, atPoint(6, 8));
    const chained = calls.docCommits[0].doc;
    const lower = chained.objects[1];
    expect(lower.parentId).toBe(upper.id);
    const { head, tail } = endsOf(chained, lower.id);
    expect(head.x).toBeCloseTo(6, 6);
    expect(head.y).toBeCloseTo(4, 6);
    expect(tail.x).toBeCloseTo(6, 6);
    expect(tail.y).toBeCloseTo(8, 6);
  });

  it('новая цепочка становится ребёнком выбранного объекта с символами', () => {
    const base = blank();
    const cells = new Map([[keyOf(0, 0), makeCell('@')]]);
    const body = createObject({ name: 'Тело', layerId: base.layers[0].id, x: 4, y: 4, cells });
    const { env, calls } = makeToolEnv(addObject(base, body), { selectedObjectId: body.id });
    const tool = createBoneTool();
    tool.onPointerDown?.(env, atPoint(4, 5));
    tool.onPointerUp?.(env, atPoint(4, 9));
    const bone = calls.docCommits[0].doc.objects[1];
    expect(bone.parentId).toBe(body.id);
  });

  it('инструмент объектов выбирает кость по отрезку и крутит её за конец вокруг сустава', () => {
    const first = makeToolEnv(blank());
    const bones = createBoneTool();
    bones.onPointerDown?.(first.env, atPoint(2, 4));
    bones.onPointerUp?.(first.env, atPoint(6, 4));
    const doc = first.calls.docCommits[0].doc;
    const id = doc.objects[0].id;

    const picking = makeToolEnv(doc);
    const objects = createObjectTool();
    objects.onPointerDown?.(picking.env, atPoint(4, 4.1));
    expect(picking.calls.selected).toEqual([id]);

    const { env, calls } = makeToolEnv(doc, { selectedObjectId: id });
    objects.onPointerDown?.(env, atPoint(6, 4));
    objects.onPointerUp?.(env, atPoint(2, 8));
    expect(calls.docCommits.map((c) => c.label)).toEqual(['Rotate object']);
    const { head, tail } = endsOf(calls.docCommits[0].doc, id);
    expect([head.x, head.y]).toEqual([2, 4]);
    expect(tail.x).toBeCloseTo(2, 5);
    expect(tail.y).toBeCloseTo(8, 5);
  });

  it('кость в цепочке за середину не отрывается от родителя, а поворачивается', () => {
    const bones = createBoneTool();
    const first = makeToolEnv(blank());
    bones.onPointerDown?.(first.env, atPoint(2, 4));
    bones.onPointerUp?.(first.env, atPoint(6, 4));
    const upper = first.calls.docCommits[0].doc;
    const second = makeToolEnv(upper, { selectedObjectId: upper.objects[0].id });
    bones.onPointerDown?.(second.env, atPoint(6, 4));
    bones.onPointerUp?.(second.env, atPoint(10, 4));
    const doc = second.calls.docCommits[0].doc;
    const id = doc.objects[1].id;

    const { env, calls } = makeToolEnv(doc);
    const objects = createObjectTool();
    objects.onPointerDown?.(env, atPoint(8, 4));
    objects.onPointerUp?.(env, atPoint(6, 6));
    expect(calls.docCommits.map((c) => c.label)).toEqual(['Rotate object']);
    const { head, tail } = endsOf(calls.docCommits[0].doc, id);
    expect(head.x).toBeCloseTo(6, 6);
    expect(head.y).toBeCloseTo(4, 6);
    expect(tail.x).toBeCloseTo(6, 5);
    expect(tail.y).toBeCloseTo(8, 5);
  });
});
