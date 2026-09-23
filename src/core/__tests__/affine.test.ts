import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  applyAffine,
  decomposeAffine,
  integerOffset,
  invertAffine,
  multiply,
  rotateScaleAbout,
  sinCosDeg,
} from '../affine';

const translate = (x: number, y: number) => ({ ...IDENTITY, e: x, f: y });

describe('affine', () => {
  it('прямые углы точные: никаких 6e-17 вместо нуля', () => {
    expect(sinCosDeg(90)).toEqual({ sin: 1, cos: 0 });
    expect(sinCosDeg(-90)).toEqual({ sin: -1, cos: 0 });
    expect(sinCosDeg(540)).toEqual({ sin: 0, cos: -1 });
    expect(sinCosDeg(0)).toEqual({ sin: 0, cos: 1 });
    expect(sinCosDeg(30).sin).toBeCloseTo(0.5);
  });

  it('положительный угол поворачивает по часовой стрелке: ось Y смотрит вниз', () => {
    const turn = rotateScaleAbout(90, 1, 1, { x: 0, y: 0 }, { x: 0, y: 0 });
    // Вправо становится вниз.
    expect(applyAffine(turn, 1, 0)).toEqual({ x: 0, y: 1 });
  });

  it('поворот и масштаб идут вокруг опорной точки, сдвиг — после', () => {
    const m = rotateScaleAbout(180, 2, 2, { x: 1, y: 1 }, { x: 10, y: 0 });
    expect(applyAffine(m, 1, 1)).toEqual({ x: 11, y: 1 });
    expect(applyAffine(m, 2, 1)).toEqual({ x: 9, y: 1 });
  });

  it('без поворота и масштаба сдвиг остаётся ровно тем, что задан', () => {
    const m = rotateScaleAbout(0, 1, 1, { x: 1.7, y: 0.3 }, { x: 3, y: -2 });
    expect(integerOffset(m)).toEqual({ x: 3, y: -2 });
    expect(integerOffset(translate(0.5, 0))).toBeNull();
    expect(integerOffset(rotateScaleAbout(90, 1, 1, { x: 0, y: 0 }, { x: 0, y: 0 }))).toBeNull();
  });

  it('композиция применяет сначала внутреннее', () => {
    const scale = rotateScaleAbout(0, 2, 2, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(applyAffine(multiply(translate(5, 0), scale), 1, 1)).toEqual({ x: 7, y: 2 });
    expect(applyAffine(multiply(scale, translate(5, 0)), 1, 1)).toEqual({ x: 12, y: 2 });
  });

  it('обратная матрица возвращает точку на место, вырожденную не обратить', () => {
    const m = rotateScaleAbout(37, 1.5, 0.75, { x: 2, y: 1 }, { x: 4, y: 9 });
    const inverse = invertAffine(m)!;
    const q = applyAffine(m, 3, -2);
    const p = applyAffine(inverse, q.x, q.y);
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(-2);
    expect(invertAffine({ a: 1, b: 2, c: 2, d: 4, e: 0, f: 0 })).toBeNull();
  });

  it('разложение даёт угол в радианах и масштабы, из которых матрица собирается обратно', () => {
    const m = rotateScaleAbout(30, 2, 0.5, { x: 0, y: 0 }, { x: 0, y: 0 });
    const { rot, sx, sy } = decomposeAffine(m);
    expect(rot).toBeCloseTo(Math.PI / 6);
    expect(sx).toBeCloseTo(2);
    expect(sy).toBeCloseTo(0.5);
    expect(decomposeAffine({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 })).toEqual({
      rot: 0,
      sx: 0,
      sy: 0,
    });
  });
});
