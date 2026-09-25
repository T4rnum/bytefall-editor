import { describe, expect, it } from 'vitest';
import { createAnimation, frameDocument } from '../animation';
import { makeCell } from '../cell';
import { composite } from '../compositor';
import { createDeformer } from '../deformers';
import { deformedPoses } from '../deformObject';
import { type Document, createDocument, duplicateLayer } from '../document';
import { keyOf } from '../grid';
import { moveInDocument } from '../hierarchy';
import { addObject, createObject, findObject, transformObject, updateObject } from '../object';
import { objectMatrices } from '../placement';
import { addIkControl, addRigNode, createBone } from '../rig';
import { deserialize, serialize } from '../serialization';
import { type SkinDeformer, skinRig } from '../skin';
import { bindSkin } from '../skinBind';
import { bufferToText } from '../text';

/**
 * Змея из десяти символов в строку с (2, 8) и две кости внутри: плечо до середины, предплечье
 * дальше. Кости — дети змеи, скиннинг привязан в позе покоя.
 */
function snake(): Document {
  let doc = createDocument({ width: 16, height: 16, background: null });
  const layerId = doc.layers[0].id;
  const cells = new Map([...'0123456789'].map((g, x) => [keyOf(x, 0), makeCell(g)] as const));
  doc = addObject(doc, createObject({ name: 'Змея', layerId, id: 'snake', x: 2, y: 8, cells }));
  const upper = createBone({
    name: 'u',
    layerId,
    id: 'u',
    head: { x: 2, y: 8.5 },
    tail: { x: 7, y: 8.5 },
  });
  doc = addRigNode(doc, upper, 'snake');
  const lower = createBone({
    name: 'l',
    layerId,
    id: 'l',
    head: { x: 7, y: 8.5 },
    tail: { x: 12, y: 8.5 },
  });
  doc = addRigNode(doc, lower, 'u');
  const skin: SkinDeformer = { ...createDeformer('skin', 'skin'), bones: bindSkin(doc, 'snake') };
  return updateObject(doc, 'snake', { deformers: [skin] });
}

/** Позы символов змеи в её координатах, по символу. */
function poses(doc: Document) {
  const obj = findObject(doc, 'snake')!;
  const rig = skinRig(obj, objectMatrices(doc));
  return new Map(deformedPoses(obj, 0, rig).map((p) => [p.glyph, p]));
}

describe('скиннинг', () => {
  it('привязка берёт кости-потомков, в покое символы стоят на местах', () => {
    const doc = snake();
    const skin = findObject(doc, 'snake')!.deformers[0] as SkinDeformer;
    expect(skin.bones.map((b) => b.id)).toEqual(['u', 'l']);
    for (const [glyph, p] of poses(doc)) {
      expect(p.x).toBeCloseTo(Number(glyph) + 0.5, 9);
      expect(p.y).toBeCloseTo(0.5, 9);
      expect(p.rot).toBeCloseTo(0, 9);
    }
  });

  it('предплечье согнулось — хвост ушёл за ним, начало на месте, у сустава смесь', () => {
    const bent = transformObject(snake(), 'l', { rot: 90 });
    const p = poses(bent);
    // Сустав в (5, 0.5) змеи: символ «9» на 4.5 дальше по кости встаёт на 4.5 ниже.
    expect(p.get('9')!.x).toBeCloseTo(5, 6);
    expect(p.get('9')!.y).toBeCloseTo(5, 6);
    expect(p.get('9')!.rot).toBeCloseTo(90, 6);
    expect(p.get('2')!.x).toBeCloseTo(2.5, 9);
    expect(p.get('2')!.rot).toBeCloseTo(0, 9);
    // «5» у самого сустава тянут обе кости: поворот между нулём и прямым углом.
    expect(p.get('5')!.rot).toBeGreaterThan(20);
    expect(p.get('5')!.rot).toBeLessThan(70);
  });

  it('IK гнёт змею: хвост идёт за контроллером', () => {
    const added = addIkControl(snake(), 'l')!;
    const moved = moveInDocument(added.doc, added.controlId, -3, 4);
    const tail = poses(moved).get('9')!;
    const world = objectMatrices(moved).get('snake')!;
    const at = {
      x: world.a * tail.x + world.c * tail.y + world.e,
      y: world.b * tail.x + world.d * tail.y + world.f,
    };
    const control = objectMatrices(moved).get(added.controlId)!;
    // Символ «9» стоит на полклетки не доходя до конца кости, где контроллер.
    expect(Math.hypot(at.x - control.e, at.y - control.f)).toBeCloseTo(0.5, 2);
  });

  it('в тексте согнутая змея — та же, что на экране: символы в ячейках под центрами', () => {
    const bent = transformObject(snake(), 'l', { rot: 90 });
    const rows = bufferToText(composite(bent)).split('\n');
    // «5» у сустава смешан из двух костей и ещё в своей ячейке, хвост ушёл вниз.
    expect(rows[8].trimEnd()).toBe('  012345');
    expect(rows[13]).toContain('9');
  });

  it('без кости её символы стоят в покое; привязка переживает сохранение', () => {
    const doc = snake();
    const orphan = { ...doc, objects: doc.objects.filter((o) => o.id !== 'l') };
    expect(poses(orphan).get('9')!.x).toBeCloseTo(9.5, 9);
    const back = frameDocument(deserialize(serialize(createAnimation(doc))), 0);
    expect(findObject(back, 'snake')!.deformers).toEqual(findObject(doc, 'snake')!.deformers);
  });

  it('копия слоя со змеёй гнётся своими костями', () => {
    const doc = snake();
    const copy = duplicateLayer(doc, doc.layers[0].id, 'copy');
    const snakes = copy.objects.filter((o) => o.name === 'Змея');
    const bones = (snakes[1].deformers[0] as SkinDeformer).bones.map((b) => b.id);
    const copies = copy.objects.filter((o) => o.name === 'u' || o.name === 'l').slice(2);
    expect(bones).toEqual(copies.map((o) => o.id));
  });
});
