import { describe, expect, it } from 'vitest';
import {
  type Affine,
  applyAffine,
  decomposeAffine,
  integerOffset,
  rotateScaleAbout,
  visualAngle,
  visualDistance,
} from '../affine';
import { type Constraint, createConstraint } from '../constraints';
import { type Document, createDocument } from '../document';
import { BUILTIN_FONT } from '../font/font';
import type { Point } from '../geometry';
import { evaluateGraph } from '../graph/evaluate';
import { keyOf } from '../grid';
import { setParent, transformForWorld } from '../hierarchy';
import { addObject, createObject, updateObject } from '../object';
import { cellsHighFor } from '../quantize';
import { objectMatrices } from '../placement';
import { restAimOffset } from '../pose';
import { addRigNode, createBone, createControl } from '../rig';
import { transformMatrix } from '../transform';
import { scaleByGesture, turnAround } from '../transformGesture';
import { wired } from './helpers/graphs';
import { poseRows } from './helpers/poseScene';

/**
 * Неквадратная ячейка (`docs/DESIGN.md`, раздел 3): шрифт 8×16, ячейка вдвое выше ширины.
 * Координаты документа в ячейках, а углы и длины — на экране, где X ячейки вдвое короче.
 */
const ASPECT = 0.5;
const tall = (doc: Document): Document => ({
  ...doc,
  font: { ...BUILTIN_FONT, cellWidth: 8, cellHeight: 16 },
});

describe('поворот неквадратной ячейки — на экране, как у жёсткого тела', () => {
  it('поворот сохраняет длины на экране; разложение возвращает угол и масштаб', () => {
    const m = rotateScaleAbout(30, 2, 1, { x: 1, y: 1 }, { x: 4, y: 2 }, ASPECT);
    const a = applyAffine(m, 1, 1);
    const b = applyAffine(m, 3, 1);
    // Отрезок в две ширины ячейки — это одна высота ячейки на экране, а после масштаба 2 — две.
    expect(visualDistance(a, b, ASPECT)).toBeCloseTo(2, 9);
    expect((visualAngle(m, ASPECT) * 180) / Math.PI).toBeCloseTo(30, 9);
    const pose = decomposeAffine(m, ASPECT);
    expect((pose.rot * 180) / Math.PI).toBeCloseTo(30, 9);
    expect(pose.sx).toBeCloseTo(2, 9);
    expect(pose.sy).toBeCloseTo(1, 9);
  });

  it('без поворота матрица та же, что у квадратной ячейки: целый сдвиг остаётся целым', () => {
    const t = { x: 7, y: 3, dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, px: 2.5, py: 1.5 };
    expect(integerOffset(transformMatrix(t, ASPECT))).toEqual({ x: 7, y: 3 });
    expect(transformMatrix({ ...t, rot: 90 }, ASPECT)).toMatchObject({ a: 0, b: 0.5, c: -2, d: 0 });
  });

  it('привязка к родителю не сдвигает повёрнутого ребёнка', () => {
    let doc = tall(createDocument({ width: 16, height: 16, background: null }));
    const layerId = doc.layers[0].id;
    const parent = createObject({ name: 'P', layerId, id: 'P', x: 4, y: 4 });
    const child = createObject({ name: 'C', layerId, id: 'C', x: 8, y: 6 });
    doc = addObject(doc, { ...parent, transform: { ...parent.transform, rot: 30 } });
    doc = addObject(doc, { ...child, transform: { ...child.transform, rot: -50, sx: 2 } });
    const before = objectMatrices(doc).get('C') as Affine;
    const after = objectMatrices(setParent(doc, 'C', 'P')).get('C') as Affine;
    // Трансформ хранится с округлением до миллионных: сверять точнее незачем.
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
      expect(after[k]).toBeCloseTo(before[k], 5);
    }
    const again = transformForWorld(child.transform, before, null, ASPECT);
    expect(again.rot).toBeCloseTo(-50, 5);
  });
});

/** Рука из двух костей и контроллер, как в тестах связей, но в ячейках 8×16. */
function armScene(target: Point): Document {
  let doc = tall(createDocument({ width: 32, height: 16, background: null }));
  const layerId = doc.layers[0].id;
  const bone = (id: string, head: Point, tail: Point) =>
    createBone({ name: id, layerId, id, head, tail, aspect: ASPECT });
  doc = addRigNode(doc, bone('upper', { x: 4, y: 8 }, { x: 12, y: 8 }), null);
  doc = addRigNode(doc, bone('lower', { x: 12, y: 8 }, { x: 18, y: 8 }), 'upper');
  doc = addRigNode(doc, createControl({ name: 't', layerId, id: 'target', at: target }), null);
  const ik: Constraint = { ...createConstraint('ik', 'ik'), target: 'target' } as Constraint;
  return updateObject(doc, 'lower', { constraints: [ik] });
}

describe('риг на неквадратной ячейке', () => {
  it('кость встаёт концом ровно в точку, из которой её тянули', () => {
    const doc = armScene({ x: 18, y: 8 });
    const lower = doc.objects.find((o) => o.id === 'lower');
    const m = objectMatrices(doc).get('lower') as Affine;
    const tail = applyAffine(m, lower?.rig?.kind === 'bone' ? lower.rig.length : 0, 0);
    expect(tail.x).toBeCloseTo(18, 9);
    expect(tail.y).toBeCloseTo(8, 9);
    const slanted = createBone({
      name: 's',
      layerId: doc.layers[0].id,
      head: { x: 0, y: 0 },
      tail: { x: 6, y: 3 },
      aspect: ASPECT,
    });
    // На экране это 3 на 3: кость на 45°.
    expect(slanted.transform.rot).toBeCloseTo(45, 9);
    const end = applyAffine(transformMatrix(slanted.transform, ASPECT), slanted.rig.length, 0);
    expect(end.x).toBeCloseTo(6, 5);
    expect(end.y).toBeCloseTo(3, 5);
  });

  it('IK дотягивается до цели: длины костей на экране от угла не зависят', () => {
    // Рука на экране — 4 и 3 высоты ячейки; цель в 6,4 от плеча, в пределах досягаемости.
    const doc = armScene({ x: 12, y: 13 });
    const m = objectMatrices(doc).get('lower') as Affine;
    const tip = applyAffine(m, 6, 0);
    expect(tip.x).toBeCloseTo(12, 2);
    expect(tip.y).toBeCloseTo(13, 2);
    // Сустав остаётся на длине плеча от плеча — на экране это 4 высоты ячейки.
    const elbow = applyAffine(objectMatrices(doc).get('upper') as Affine, 8, 0);
    expect(visualDistance({ x: 4, y: 8 }, elbow, ASPECT)).toBeCloseTo(4, 6);
  });

  it('слежение смотрит на цель на экране', () => {
    let doc = tall(createDocument({ width: 16, height: 16, background: null }));
    const layerId = doc.layers[0].id;
    doc = addObject(doc, createObject({ name: 'L', layerId, id: 'L', x: 2, y: 8 }));
    doc = addObject(doc, createObject({ name: 'K', layerId, id: 'K', x: 6, y: 8 }));
    const aim = { ...createConstraint('aim', 'a'), target: 'L', offset: 0 } as Constraint;
    // Цель на 4 ячейки левее и на 2 выше — на экране это 2 на 2, ровно 45° вверх-влево.
    const aimed = updateObject(updateObject(doc, 'K', { constraints: [aim] }), 'L', {
      transform: { ...createObject({ name: 'L', layerId, x: 2, y: 6 }).transform },
    });
    const angle = (visualAngle(objectMatrices(aimed).get('K') as Affine, ASPECT) * 180) / Math.PI;
    expect(angle).toBeCloseTo(-135, 6);
    expect(Math.abs(restAimOffset(aimed, 'K', 'L'))).toBeCloseTo(0, 6);
  });
});

describe('картинка в неквадратные ячейки', () => {
  it('рядов вдвое меньше: квадратная картинка остаётся квадратной на экране', () => {
    expect(cellsHighFor({ width: 100, height: 100 }, 40, ASPECT)).toBe(20);
    expect(cellsHighFor({ width: 100, height: 100 }, 40)).toBe(40);
  });
});

describe('жесты и узлы на неквадратной ячейке', () => {
  it('четверть круга указателем на экране — поворот на 90°', () => {
    const pivot = { x: 10, y: 10 };
    // Вправо на 4 ширины ячейки (2 на экране) и вниз на 2 высоты — оба на 2 от опоры.
    expect(turnAround(pivot, { x: 14, y: 10 }, { x: 10, y: 12 }, ASPECT)).toBeCloseTo(90, 9);
    const t = { x: 0, y: 0, dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, px: 0, py: 0 };
    const world = transformMatrix(t, ASPECT);
    const scaled = scaleByGesture(t, world, 'e', { x: 4, y: 0 }, { x: 8, y: 0 }, false, ASPECT);
    expect(scaled).toEqual({ sx: 2, sy: 1 });
  });

  it('поворот вокруг центра узлом держит расстояния на экране', () => {
    const base = wired([['r', 'rotate']], ['in.glyphs → r.glyphs', 'r.glyphs → out.glyphs']);
    const graph = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === 'r' ? { ...n, values: { angle: 90 }, options: { pivot: 'center' } } : n,
      ),
    };
    const center = { x: 3, y: 1 };
    const source = poseRows();
    const ctx = { time: 0, center, cells: new Map(), aspect: ASPECT };
    const turned = evaluateGraph(graph, poseRows(), ctx);
    turned.forEach((p, i) => {
      const was = visualDistance(center, source[i], ASPECT);
      expect(visualDistance(center, p, ASPECT)).toBeCloseTo(was, 9);
    });
    // Символ (4.5, 1.5) от центра (3, 1) на экране — (0.75, 0.5). По часовой на 90° он
    // встаёт в (−0.5, 0.75): это −1 ширина ячейки и 0.75 высоты.
    const right = turned[source.findIndex((p) => p.key === keyOf(4, 1))];
    expect(right.x).toBeCloseTo(2, 9);
    expect(right.y).toBeCloseTo(1.75, 9);
  });
});
