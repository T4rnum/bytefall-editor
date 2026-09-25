import { describe, expect, it } from 'vitest';
import { createAnimation, frameDocument } from '../animation';
import { composite } from '../compositor';
import { createDocument } from '../document';
import { composeFrame } from '../frame';
import { findObject } from '../object';
import { objectMatrix } from '../placement';
import {
  type Bone,
  addRigNode,
  boneEnds,
  createBone,
  createControl,
  isBone,
  setBoneLength,
} from '../rig';
import { deserialize, serialize, toFileObject } from '../serialization';
import { bufferToText } from '../text';

const base = () => createDocument({ width: 16, height: 16, background: null });

/** Плечо от (2, 8) вправо на 4 ячейки и предплечье дальше вниз-вправо. */
function arm() {
  let doc = base();
  const layerId = doc.layers[0].id;
  const upper = createBone({ name: 'Плечо', layerId, head: { x: 2, y: 8 }, tail: { x: 6, y: 8 } });
  doc = addRigNode(doc, upper, null);
  const lower = createBone({
    name: 'Предплечье',
    layerId,
    id: 'lower',
    head: { x: 6, y: 8 },
    tail: { x: 9, y: 12 },
  });
  doc = addRigNode(doc, lower, upper.id);
  return { doc, upper, lower };
}

const ends = (doc: ReturnType<typeof base>, id: string) => {
  const bone = findObject(doc, id) as Bone;
  return boneEnds(objectMatrix(doc, bone), bone.rig);
};

describe('кости и контроллеры', () => {
  it('кость от начала к концу: сустав в начале, длина и угол по отрезку', () => {
    const bone = createBone({
      name: 'b',
      layerId: 'l',
      head: { x: 2.3, y: 4 },
      tail: { x: 5.3, y: 8 },
    });
    expect(bone.rig).toEqual({ kind: 'bone', length: 5, limit: null });
    expect(bone.transform).toMatchObject({ x: 2, y: 4, px: 0, py: 0 });
    expect(bone.transform.dx).toBeCloseTo(0.3, 6);
    expect(bone.transform.rot).toBeCloseTo((Math.atan2(4, 3) * 180) / Math.PI, 5);
    expect(isBone(bone)).toBe(true);
    expect(bone.cells.size).toBe(0);
  });

  it('кость под родителем остаётся там, где её нарисовали', () => {
    const { doc, upper } = arm();
    const lower = findObject(doc, 'lower')!;
    expect(lower.parentId).toBe(upper.id);
    const { head, tail } = ends(doc, 'lower');
    expect(head.x).toBeCloseTo(6, 5);
    expect(head.y).toBeCloseTo(8, 5);
    expect(tail.x).toBeCloseTo(9, 5);
    expect(tail.y).toBeCloseTo(12, 5);
  });

  it('новая длина кости уносит конец и прицепленные к нему кости', () => {
    const { doc, upper } = arm();
    const longer = setBoneLength(doc, upper.id, 6);
    expect(ends(longer, upper.id).tail.x).toBeCloseTo(8, 5);
    expect(ends(longer, 'lower').head.x).toBeCloseTo(8, 5);
    expect(setBoneLength(doc, upper.id, 4)).toBe(doc);
  });

  it('риг не рисуется: ни в картинке, ни в тексте его нет', () => {
    const { doc } = arm();
    const layerId = doc.layers[0].id;
    const withControl = addRigNode(
      doc,
      createControl({ name: 'Цель', layerId, at: { x: 10.5, y: 3.5 } }),
      null,
    );
    expect(bufferToText(composite(withControl)).trim()).toBe('');
    const glyphs = composeFrame(withControl).passes.find((p) => p.kind === 'glyphs');
    expect(glyphs?.kind === 'glyphs' ? glyphs.batch.count : 0).toBe(0);
  });

  it('риг переживает сохранение, пределы угла встают по порядку', () => {
    const { doc, upper } = arm();
    const layerId = doc.layers[0].id;
    const limited = {
      ...findObject(doc, upper.id)!,
      rig: { kind: 'bone' as const, length: 4, limit: { min: -30, max: 90 } },
    };
    const control = createControl({ name: 'Цель', layerId, id: 'target', at: { x: 10, y: 3 } });
    const scene = addRigNode(
      { ...doc, objects: doc.objects.map((o) => (o.id === upper.id ? limited : o)) },
      control,
      null,
    );
    const back = frameDocument(deserialize(serialize(createAnimation(scene))), 0);
    expect(findObject(back, upper.id)!.rig).toEqual(limited.rig);
    expect(findObject(back, 'target')!.rig).toEqual({ kind: 'control' });
    expect(findObject(back, 'lower')!.parentId).toBe(upper.id);

    const file = toFileObject(createAnimation(scene));
    const bone = file.frames![0].objects!.find((o) => o.id === upper.id)!;
    bone.rig = { kind: 'bone', length: 4, limit: { min: 90, max: -30 } };
    const read = frameDocument(deserialize(JSON.stringify(file)), 0);
    expect(findObject(read, upper.id)!.rig).toEqual(limited.rig);
  });
});
