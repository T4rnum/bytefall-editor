import { describe, expect, it } from 'vitest';
import { createAnimation, frameDocument } from '../animation';
import { composite, effectsSignature } from '../compositor';
import { composeFrame } from '../frame';
import { readInstance } from '../instances';
import {
  DEFAULT_GLOW,
  FONT_PIXEL,
  type GlyphMaterial,
  MATERIAL,
  hasMaterial,
  isAnimatedMaterial,
  materialFloats,
  withMaterialPart,
} from '../material';
import { findObject, updateObject } from '../object';
import { isFreeObject, objectMatrix } from '../placement';
import { deserialize, serialize } from '../serialization';
import { bufferToText } from '../text';
import { hasMotion } from '../timeline';
import { BALL, ballScene } from './helpers/ballScene';

const outline = { color: '#ff0000', width: 2 };
const glow = { color: '#0000ff', radius: 0.75, strength: 2 };
const shine = { color: '#ffffff', width: 1, spacing: 10, speed: 4, angle: 90 };

/** Материал из частей: не названные части — null. */
const mat = (parts: Partial<GlyphMaterial>): GlyphMaterial => ({
  outline: null,
  glow: null,
  shine: null,
  dither: null,
  ...parts,
});

/** Мяч с материалом. */
function ballWith(material: GlyphMaterial) {
  const { anim } = ballScene();
  const doc = updateObject(frameDocument(anim, 0), BALL, { material });
  return { anim: { ...anim, frames: [{ ...anim.frames[0], objects: doc.objects }] }, doc };
}

describe('GPU-материал объекта', () => {
  it('в числа для потока: контур, свечение, блик и дизеринг на своих местах', () => {
    const floats = [...materialFloats(mat({ outline, glow, shine, dither: { amount: 0.25 } }))!];
    expect(floats.slice(MATERIAL.outline, MATERIAL.outline + 4)).toEqual([1, 0, 0, 2 * FONT_PIXEL]);
    expect(floats.slice(MATERIAL.glow, MATERIAL.glow + 4)).toEqual([0, 0, 1, 0.75]);
    expect(floats[MATERIAL.glowStrength]).toBe(2);
    expect(floats.slice(MATERIAL.shine, MATERIAL.shine + 4)).toEqual([1, 1, 1, 1]);
    const [spacing, speed, angle] = floats.slice(MATERIAL.shineMotion, MATERIAL.shineMotion + 3);
    expect([spacing, speed]).toEqual([10, 4]);
    expect(angle).toBeCloseTo(Math.PI / 2, 6);
    expect(floats[MATERIAL.dither]).toBe(0.25);
    expect(materialFloats(mat({ glow: DEFAULT_GLOW }))!.slice(0, 4)).toEqual(new Float32Array(4));
    expect(materialFloats(null)).toBeNull();
    expect(materialFloats(mat({}))).toBeNull();
  });

  it('материал без частей — это отсутствие материала; бегущий блик — функция времени', () => {
    expect(hasMaterial(mat({}))).toBe(false);
    expect(withMaterialPart(mat({ outline }), { outline: null })).toBeNull();
    expect(withMaterialPart(null, { glow })).toEqual(mat({ glow }));
    expect(isAnimatedMaterial(mat({ shine }))).toBe(true);
    expect(isAnimatedMaterial(mat({ shine: { ...shine, speed: 0 } }))).toBe(false);
    expect(isAnimatedMaterial(mat({ glow }))).toBe(false);
  });

  it('объект с материалом свободный, и его символы несут материал в поток', () => {
    const { doc } = ballWith(mat({ outline, glow }));
    const ball = findObject(doc, BALL)!;
    expect(isFreeObject(ball, objectMatrix(doc, ball))).toBe(true);
    const frame = composeFrame(doc, null, null, [], 250);
    expect(frame.time).toBe(250);
    const pass = frame.passes.find((p) => p.kind === 'glyphs');
    if (pass?.kind !== 'glyphs') throw new Error('ожидался поток символов');
    expect(readInstance(pass.batch, 0).material.slice(0, 4)).toEqual([1, 0, 0, 0.25]);
  });

  it('бегущий блик делает сцену движением и пересобирает кадр на тиках', () => {
    const { anim, doc } = ballWith(mat({ shine }));
    expect(hasMotion(anim)).toBe(true);
    expect(effectsSignature(doc, 0)).not.toBe(effectsSignature(doc, 10));
    expect(hasMotion(ballWith(mat({ outline })).anim)).toBe(false);
    expect(hasMotion(createAnimation(frameDocument(anim, 0)))).toBe(true);
  });

  it('в текст материал не попадает: у текста нет контура и свечения', () => {
    const { anim, doc } = ballWith(mat({ outline, glow }));
    expect(bufferToText(composite(doc))).toBe(bufferToText(composite(frameDocument(anim, 0))));
    expect(bufferToText(composite(doc))).toContain('O');
  });

  it('материал переживает сохранение, пустые части в файл не пишутся', () => {
    const full = mat({ outline, glow, shine, dither: { amount: 0.5 } });
    const back = deserialize(serialize(ballWith(full).anim));
    expect(findObject(frameDocument(back, 0), BALL)!.material).toEqual(full);
    expect(serialize(ballWith(mat({ glow })).anim)).not.toContain('outline');
  });
});
