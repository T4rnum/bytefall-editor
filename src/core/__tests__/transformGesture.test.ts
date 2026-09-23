import { describe, expect, it } from 'vitest';
import { applyAffine } from '../affine';
import { createTransform, transformMatrix, withPivot } from '../transform';
import {
  normalizeAngle,
  pivotByGesture,
  rotateByGesture,
  scaleByGesture,
  turnAround,
} from '../transformGesture';

const origin = { x: 0, y: 0 };
const plain = createTransform(0, 0, origin);

describe('rotateByGesture', () => {
  it('указатель, прошедший четверть круга по часовой, поворачивает на 90°', () => {
    // Ось Y вниз: из «справа» в «снизу» — это по часовой стрелке.
    expect(turnAround(origin, { x: 1, y: 0 }, { x: 0, y: 1 })).toBe(90);
    expect(turnAround(origin, { x: 1, y: 0 }, { x: 0, y: -1 })).toBe(-90);
    // Через край полуоборота — кратчайшим путём, а не почти полным кругом назад.
    expect(turnAround(origin, { x: -1, y: 0.01 }, { x: -1, y: -0.01 })).toBeCloseTo(1.15, 2);
  });

  it('угол прибавляется к начальному и не сворачивается: ключу нужен путь, а не положение', () => {
    const start = { ...plain, rot: 170 };
    expect(rotateByGesture(start, 90)).toBe(260);
    expect(rotateByGesture(start, 720)).toBe(890);
    expect(normalizeAngle(540)).toBe(180);
    expect(normalizeAngle(-190)).toBe(170);
  });

  it('с шагом угол прилипает, без шага округляется до десятой доли градуса', () => {
    const turned = turnAround(origin, { x: 1, y: 0 }, { x: Math.cos(0.65), y: Math.sin(0.65) });
    expect(rotateByGesture(plain, turned, 15)).toBe(30);
    expect(rotateByGesture(plain, turned)).toBe(37.2);
  });
});

describe('scaleByGesture', () => {
  const world = transformMatrix(plain);

  it('боковая ручка тянет одну ось, угловая — обе', () => {
    expect(scaleByGesture(plain, world, 'e', { x: 2, y: 0 }, { x: 4, y: 1 }, false)).toEqual({
      sx: 2,
      sy: 1,
    });
    expect(scaleByGesture(plain, world, 'n', { x: 0, y: -1 }, { x: 0, y: -3 }, false)).toEqual({
      sx: 1,
      sy: 3,
    });
    expect(scaleByGesture(plain, world, 'se', { x: 2, y: 1 }, { x: 3, y: 3 }, false)).toEqual({
      sx: 1.5,
      sy: 3,
    });
  });

  it('пропорциональный жест даёт одно отношение на обе оси', () => {
    const start = { ...plain, sx: 2, sy: 1 };
    expect(
      scaleByGesture(start, transformMatrix(start), 'se', { x: 2, y: 1 }, { x: 4, y: 2 }, true),
    ).toEqual({
      sx: 4,
      sy: 2,
    });
  });

  it('оси считаются в осях объекта: у повёрнутого на 90° ось X смотрит вниз', () => {
    const turned = { ...plain, rot: 90 };
    const turnedWorld = transformMatrix(turned);
    expect(scaleByGesture(turned, turnedWorld, 'e', { x: 0, y: 2 }, { x: 0, y: 5 }, false)).toEqual(
      {
        sx: 2.5,
        sy: 1,
      },
    );
  });
});

describe('опорная точка', () => {
  it('без поворота опора переносится, а объект остаётся на месте', () => {
    const t = createTransform(5, 3, { x: 1, y: 1 });
    const moved = withPivot(t, { x: 2.5, y: 0.5 });
    expect(moved).toMatchObject({ x: 5, y: 3, dx: 0, dy: 0, px: 2.5, py: 0.5 });
  });

  it('у повёрнутого объекта перенос опоры не двигает ни одной ячейки', () => {
    const t = { ...createTransform(10, 4, { x: 1.5, y: 0.5 }), rot: 30, sx: 1.5 };
    const before = transformMatrix(t);
    const moved = pivotByGesture(t, before, { x: 13.2, y: 7.9 });
    expect(Number.isInteger(moved.px * 2)).toBe(true);
    expect(Math.abs(moved.dx)).toBeLessThanOrEqual(0.5);
    const after = transformMatrix(moved);
    for (const [x, y] of [
      [0, 0],
      [3, 1],
      [-2, 5],
    ]) {
      const a = applyAffine(before, x, y);
      const b = applyAffine(after, x, y);
      // Смещение хранится с точностью до миллионной доли ячейки: глазу это не видно.
      expect(b.x).toBeCloseTo(a.x, 5);
      expect(b.y).toBeCloseTo(a.y, 5);
    }
  });
});
