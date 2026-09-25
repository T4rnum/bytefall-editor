import { describe, expect, it } from 'vitest';
import { frameDocument } from '../animation';
import { composite } from '../compositor';
import { composeFrame } from '../frame';
import { readInstance } from '../instances';
import {
  DEFAULT_GLOW,
  FONT_PIXEL,
  hasMaterial,
  materialFloats,
  withMaterialPart,
} from '../material';
import { findObject, updateObject } from '../object';
import { isFreeObject, objectMatrix } from '../placement';
import { deserialize, serialize } from '../serialization';
import { bufferToText } from '../text';
import { BALL, ballScene } from './helpers/ballScene';

const outline = { color: '#ff0000', width: 2 };
const glow = { color: '#0000ff', radius: 0.75, strength: 2 };

/** Мяч с контуром и свечением. */
function glowingBall() {
  const { anim } = ballScene();
  const doc = updateObject(frameDocument(anim, 0), BALL, { material: { outline, glow } });
  return { anim: { ...anim, frames: [{ ...anim.frames[0], objects: doc.objects }] }, doc };
}

describe('GPU-материал объекта', () => {
  it('в числа для потока: контур — цвет и толщина в ячейках, свечение — цвет, радиус, сила', () => {
    expect([...materialFloats({ outline, glow })!]).toEqual([
      1,
      0,
      0,
      2 * FONT_PIXEL,
      0,
      0,
      1,
      0.75,
      2,
    ]);
    expect([...materialFloats({ outline: null, glow: DEFAULT_GLOW })!].slice(0, 4)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(materialFloats(null)).toBeNull();
    expect(materialFloats({ outline: null, glow: null })).toBeNull();
  });

  it('материал без обеих частей — это отсутствие материала', () => {
    expect(hasMaterial({ outline: null, glow: null })).toBe(false);
    expect(withMaterialPart({ outline, glow: null }, { outline: null })).toBeNull();
    expect(withMaterialPart(null, { glow })).toEqual({ outline: null, glow });
  });

  it('объект с материалом свободный, и его символы несут материал в поток', () => {
    const { doc } = glowingBall();
    const ball = findObject(doc, BALL)!;
    expect(isFreeObject(ball, objectMatrix(doc, ball))).toBe(true);
    const pass = composeFrame(doc).passes.find((p) => p.kind === 'glyphs');
    if (pass?.kind !== 'glyphs') throw new Error('ожидался поток символов');
    expect(readInstance(pass.batch, 0).material).toEqual([1, 0, 0, 0.25, 0, 0, 1, 0.75, 2]);
  });

  it('в текст материал не попадает: у текста нет контура и свечения', () => {
    const { anim, doc } = glowingBall();
    expect(bufferToText(composite(doc))).toBe(bufferToText(composite(frameDocument(anim, 0))));
    expect(bufferToText(composite(doc))).toContain('O');
  });

  it('материал переживает сохранение, пустые части в файл не пишутся', () => {
    const { anim } = glowingBall();
    const back = deserialize(serialize(anim));
    expect(findObject(frameDocument(back, 0), BALL)!.material).toEqual({ outline, glow });
    const onlyGlow = updateObject(frameDocument(anim, 0), BALL, {
      material: { outline: null, glow },
    });
    const saved = serialize({
      ...anim,
      frames: [{ ...anim.frames[0], objects: onlyGlow.objects }],
    });
    expect(saved).not.toContain('outline');
  });
});
