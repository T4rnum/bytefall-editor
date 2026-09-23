import { describe, expect, it } from 'vitest';
import { createAnimation } from '../animation';
import { makeCell } from '../cell';
import { composite, effectsSignature } from '../compositor';
import { createDocument } from '../document';
import { createDeformer } from '../deformers';
import { deformedPoses, isDeformed } from '../deformObject';
import { composeFrame } from '../frame';
import { keyOf } from '../grid';
import { readInstance } from '../instances';
import { addObject, createObject, updateObject } from '../object';
import { isFreeObject, objectMatrix } from '../placement';
import { bufferToText } from '../text';
import { hasMotion } from '../timeline';

/** Строка «abcd» объектом в (1, 1); волна поднимает одни символы и опускает другие. */
function scene(enabled = true) {
  const base = createDocument({ width: 8, height: 4, background: null });
  const cells = new Map([...'abcd'].map((g, x) => [keyOf(x, 0), makeCell(g, '#ffffff')] as const));
  const obj = createObject({
    id: 'o',
    name: 'Строка',
    layerId: base.layers[0].id,
    x: 1,
    y: 1,
    cells,
  });
  const wave = {
    ...createDeformer('wave', 'w'),
    amplitude: 1,
    wavelength: 4,
    period: 1000,
    enabled,
  };
  return updateObject(addObject(base, obj), 'o', { deformers: [wave] });
}

describe('деформированный объект', () => {
  it('свободный: рисуется потоком символов, сдвинутых деформером', () => {
    const doc = scene();
    const obj = doc.objects[0];
    expect(isDeformed(obj)).toBe(true);
    expect(isFreeObject(obj, objectMatrix(doc, obj))).toBe(true);
    const pass = composeFrame(doc).passes.find((p) => p.kind === 'glyphs');
    if (pass?.kind !== 'glyphs') throw new Error('ожидался поток символов');
    const ys = Array.from({ length: pass.batch.count }, (_, i) => readInstance(pass.batch, i).y);
    expect(ys.map((y) => Math.round((y - 1.5) * 1000) / 1000)).toEqual([
      0.707, 0.707, -0.707, -0.707,
    ]);
    expect(isDeformed(scene(false).objects[0])).toBe(false);
  });

  it('в текст символы попадают в ячейку под своим центром', () => {
    const text = bufferToText(composite(scene()));
    // Смещения ±0.707: центры a и b уходят в строку 2, c и d — в строку 0.
    expect(text.split('\n').slice(0, 3)).toEqual(['   cd', '', ' ab']);
  });

  it('объект с деформером — функция времени: движение для экспорта и пересборка на тиках', () => {
    const doc = scene();
    expect(hasMotion(createAnimation(doc))).toBe(true);
    expect(effectsSignature(doc, 0)).not.toBe(effectsSignature(doc, 10));
    expect(deformedPoses(doc.objects[0], 250)).not.toEqual(deformedPoses(doc.objects[0], 0));
    expect(deformedPoses(doc.objects[0], 250)).toEqual(deformedPoses(doc.objects[0], 250));
  });
});
