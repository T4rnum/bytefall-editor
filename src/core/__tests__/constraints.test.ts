import { describe, expect, it } from 'vitest';
import { type Affine, applyAffine } from '../affine';
import { createAnimation, frameDocument } from '../animation';
import { makeCell } from '../cell';
import { type Constraint, createConstraint } from '../constraints';
import { createDocument, duplicateLayer } from '../document';
import { evaluate } from '../evaluate';
import { keyOf } from '../grid';
import { type IkLink, solveFabrik } from '../ik';
import { addObject, createObject, findObject, updateObject } from '../object';
import { objectMatrices } from '../placement';
import { addRigNode, createBone, createControl } from '../rig';
import { deserialize, serialize, toFileObject } from '../serialization';
import { setKey } from '../tracks';

const link = (length: number, limit: IkLink['limit'] = null): IkLink => ({
  length,
  offset: 0,
  limit,
});

/** Конец цепочки по мировым углам костей. */
function tipOf(root: { x: number; y: number }, links: IkLink[], angles: number[]) {
  let p = root;
  angles.forEach((a, i) => {
    const r = (a * Math.PI) / 180;
    p = { x: p.x + Math.cos(r) * links[i].length, y: p.y + Math.sin(r) * links[i].length };
  });
  return p;
}

describe('FABRIK', () => {
  it('конец встаёт в достижимую цель, звенья держат длину', () => {
    const links = [link(4), link(3)];
    const angles = solveFabrik({ x: 0, y: 0 }, links, [0, 0], 0, { x: 3, y: 4 });
    const tip = tipOf({ x: 0, y: 0 }, links, angles);
    expect(tip.x).toBeCloseTo(3, 3);
    expect(tip.y).toBeCloseTo(4, 3);
  });

  it('недостижимая цель вытягивает цепочку в свою сторону', () => {
    const angles = solveFabrik({ x: 0, y: 0 }, [link(4), link(3)], [30, 60], 0, { x: 0, y: 20 });
    expect(angles[0]).toBeCloseTo(90, 3);
    expect(angles[1]).toBeCloseTo(90, 3);
  });

  it('сустав не выходит за пределы относительно родителя', () => {
    const stiff = [link(4), link(3, { min: 0, max: 0 })];
    const angles = solveFabrik({ x: 0, y: 0 }, stiff, [0, 0], 0, { x: 3, y: 4 });
    expect(angles[1] - angles[0]).toBeCloseTo(0, 6);
  });
});

/** Рука: плечо от (2, 8) на 4 вправо, предплечье ещё на 3, кисть с символом на конце. */
function armScene(target: { x: number; y: number }) {
  let doc = createDocument({ width: 16, height: 16, background: null });
  const layerId = doc.layers[0].id;
  const upper = createBone({
    name: 'u',
    layerId,
    id: 'upper',
    head: { x: 2, y: 8 },
    tail: { x: 6, y: 8 },
  });
  doc = addRigNode(doc, upper, null);
  const lower = createBone({
    name: 'l',
    layerId,
    id: 'lower',
    head: { x: 6, y: 8 },
    tail: { x: 9, y: 8 },
  });
  doc = addRigNode(doc, lower, 'upper');
  doc = addRigNode(doc, createControl({ name: 't', layerId, id: 'target', at: target }), null);
  const hand = createObject({
    name: 'h',
    layerId,
    id: 'hand',
    x: 9,
    y: 8,
    cells: new Map([[keyOf(0, 0), makeCell('@')]]),
  });
  doc = addObject(doc, {
    ...hand,
    parentId: 'lower',
    transform: { ...hand.transform, x: 3, y: 0, px: 0, py: 0 },
  });
  const ik: Constraint = { ...createConstraint('ik', 'ik'), target: 'target' } as Constraint;
  return updateObject(doc, 'lower', { constraints: [ik] });
}

const tipOfArm = (m: ReadonlyMap<string, Affine>) => applyAffine(m.get('lower')!, 3, 0);

describe('IK в сцене', () => {
  it('кисть тянется к контроллеру, собственный поворот костей не меняется', () => {
    const doc = armScene({ x: 6, y: 13 });
    const m = objectMatrices(doc);
    const tip = tipOfArm(m);
    expect(tip.x).toBeCloseTo(6, 2);
    expect(tip.y).toBeCloseTo(13, 2);
    expect(findObject(doc, 'lower')!.transform.rot).toBe(0);
    // Ребёнок кости едет с ней: кисть стоит на конце предплечья.
    const hand = applyAffine(m.get('hand')!, 0, 0);
    expect(hand.x).toBeCloseTo(tip.x, 6);
    expect(hand.y).toBeCloseTo(tip.y, 6);
  });

  it('без цели и выключенный IK ничего не делает', () => {
    const doc = armScene({ x: 6, y: 13 });
    const off = updateObject(doc, 'lower', {
      constraints: [{ ...createConstraint('ik', 'ik'), enabled: false }],
    });
    expect(tipOfArm(objectMatrices(off))).toEqual({ x: 9, y: 8 });
  });
});

/** Ведущий едет по X от 0 до 10 за секунду, ведомый — его ребёнок на две клетки позади. */
function followScene(delay: number) {
  let doc = createDocument({ width: 16, height: 8, background: null });
  const layerId = doc.layers[0].id;
  const leader = createObject({ name: 'L', layerId, id: 'leader', x: 0, y: 2 });
  const tail = createObject({ name: 'T', layerId, id: 'tail', x: -2, y: 0 });
  doc = addObject(addObject(doc, leader), { ...tail, parentId: 'leader' });
  doc = updateObject(doc, 'tail', {
    constraints: [{ ...createConstraint('follow', 'f'), delay } as Constraint],
  });
  const position = { node: 'object', id: 'leader', property: 'position' } as const;
  const tracks = setKey(setKey([], position, 0, [0, 2]), position, 1000, [10, 2]);
  return { ...createAnimation(doc), tracks };
}

const originAt = (anim: ReturnType<typeof followScene>, id: string, t: number) =>
  applyAffine(objectMatrices(evaluate(anim, t)).get(id)!, 0, 0);

describe('цепь с задержкой и слежение', () => {
  it('ведомый идёт за ведущим таким, каким тот был задержку назад', () => {
    const anim = followScene(200);
    expect(originAt(anim, 'tail', 600).x).toBeCloseTo(4 - 2, 6);
    // Собственный трансформ ведомого прежний: задержка живёт в матрице, а не в кадре.
    expect(findObject(evaluate(anim, 600), 'tail')!.transform.x).toBe(-2);
  });

  it('в начале петли прошлое берётся с конца предыдущего круга', () => {
    const anim = followScene(200);
    // Сцена с движением длится две секунды; за 100 мс до нуля — это 1900 мс, ведущий уже в 10.
    expect(originAt(anim, 'tail', 100).x).toBeCloseTo(10 - 2, 6);
  });

  it('слежение поворачивает ось X к цели, с запаздыванием — к её прошлому месту', () => {
    const base = followScene(0);
    const watcher = createObject({
      name: 'W',
      layerId: base.frames[0].layers[0].id,
      id: 'w',
      x: 5,
      y: 6,
    });
    const doc = addObject(frameDocument(base, 0), {
      ...watcher,
      transform: { ...watcher.transform, dx: 0.5, px: 0, py: 0 },
    });
    const aim = (lag: number): Constraint =>
      ({ ...createConstraint('aim', 'a'), target: 'leader', lag }) as Constraint;
    const scene = (lag: number) => {
      const withAim = updateObject(doc, 'w', { constraints: [aim(lag)] });
      return { ...base, frames: [{ ...base.frames[0], objects: withAim.objects }] };
    };
    const angle = (anim: ReturnType<typeof scene>, t: number) => {
      const m = objectMatrices(evaluate(anim, t)).get('w')!;
      return (Math.atan2(m.b, m.a) * 180) / Math.PI;
    };
    // Цель — опора ведущего, центр его клетки. В 500 мс она в (5.5, 2.5): прямо над
    // наблюдателем в (5.5, 6). В секунду — в (10.5, 2.5), наискосок.
    expect(angle(scene(0), 500)).toBeCloseTo(-90, 4);
    expect(angle(scene(0), 1000)).toBeCloseTo((Math.atan2(-3.5, 5) * 180) / Math.PI, 4);
    // С запаздыванием в 500 мс в секунду наблюдатель смотрит туда, где ведущий был в 500 мс.
    expect(angle(scene(500), 1000)).toBeCloseTo(-90, 4);
  });
});

describe('связи в файле и в копиях', () => {
  it('связи переживают сохранение, повторный id в объекте не проходит', () => {
    const doc = armScene({ x: 6, y: 13 });
    const back = frameDocument(deserialize(serialize(createAnimation(doc))), 0);
    expect(findObject(back, 'lower')!.constraints).toEqual(findObject(doc, 'lower')!.constraints);
    const file = toFileObject(createAnimation(doc));
    const lower = file.frames![0].objects!.find((o) => o.id === 'lower')!;
    lower.constraints = [...lower.constraints!, ...lower.constraints!];
    expect(() => deserialize(JSON.stringify(file))).toThrow(/constraint/);
  });

  it('копия слоя с ригом тянется за своим контроллером', () => {
    const doc = armScene({ x: 6, y: 13 });
    const copy = duplicateLayer(doc, doc.layers[0].id, 'copy');
    const lowers = copy.objects.filter((o) => o.name === 'l');
    const controls = copy.objects.filter((o) => o.name === 't');
    const ik = lowers[1].constraints[0];
    expect(ik.kind === 'ik' && ik.target).toBe(controls[1].id);
    expect(controls[1].id).not.toBe('target');
  });
});
