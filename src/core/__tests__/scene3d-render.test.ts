import { afterEach, describe, expect, it } from 'vitest';
import { makeCell } from '../cell';
import { composite } from '../compositor';
import { type Document, createDocument } from '../document';
import { createEffect } from '../effects';
import { keyOf } from '../grid';
import { DEFAULT_QUANTIZE } from '../quantize';
import {
  type RenderBuffers,
  type Scene3DRequest,
  buffersToCells,
  setScene3DRenderer,
} from '../scene3d/render';
import { addNode3D, createNode3D, createScene3D } from '../scene3d/scene';
import { bufferToText } from '../text';

/** Холст 8×4 с 3D-слоем из одного куба. */
function scene3dDoc(): Document {
  const base = createDocument({ width: 8, height: 4, background: null });
  const scene = addNode3D(createScene3D(), createNode3D('box', 'Куб', {}, 'cube'));
  return { ...base, layers: [{ ...base.layers[0], scene }] };
}

/** Рендер-заглушка: по «@» на тело в нижней строке, считает вызовы. */
function fakeRenderer() {
  const calls: Scene3DRequest[] = [];
  setScene3DRenderer((request) => {
    calls.push(request);
    const row = request.height - 1;
    return new Map(request.scene.nodes.map((_, i) => [keyOf(i, row), makeCell('@', '#ffffff')]));
  });
  return calls;
}

const lastRow = (doc: Document, time = 0): string =>
  bufferToText(composite(doc, null, undefined, [], time)).split('\n')[doc.height - 1];

afterEach(() => setScene3DRenderer(null));

describe('3D-слой в композиторе', () => {
  it('без рендера 3D-слой пуст, с ним — ячейки рендера вместо растра слоя', () => {
    const doc = scene3dDoc();
    const painted: Document = {
      ...doc,
      layers: [{ ...doc.layers[0], cells: new Map([[keyOf(5, 2), makeCell('X')]]) }],
    };
    expect(bufferToText(composite(painted)).trim()).toBe('');
    const calls = fakeRenderer();
    expect(lastRow(painted)).toBe('@');
    expect(calls[0]).toMatchObject({ width: 8, height: 4, meshes: [] });
  });

  it('неподвижная сцена рендерится один раз, новая сцена или размер — заново', () => {
    const calls = fakeRenderer();
    const doc = scene3dDoc();
    composite(doc);
    composite(doc);
    expect(calls).toHaveLength(1);
    const scene = addNode3D(doc.layers[0].scene!, createNode3D('sphere', 'Шар', {}, 'ball'));
    const two = { ...doc, layers: [{ ...doc.layers[0], scene }] };
    expect(lastRow(two)).toBe('@@');
    composite({ ...doc, width: 9 });
    expect(calls).toHaveLength(3);
  });

  it('эффекты слоя работают с рендером сцены, как с растром', () => {
    fakeRenderer();
    const doc = scene3dDoc();
    const fire = createEffect('fire', 'fx');
    const burning = { ...doc, layers: [{ ...doc.layers[0], effects: [fire] }] };
    const rows = bufferToText(composite(burning, null, undefined, [], 500)).split('\n');
    // Над «@» рендера горит пламя огня слоя.
    expect(rows[3].startsWith('@')).toBe(true);
    expect(rows.slice(0, 3).join('').trim()).not.toBe('');
  });
});

/** Буферы: квадрат 2×2 ячейки в середине холста 6×4 смотрит на камеру, вокруг — пусто. */
function squareBuffers(crease = false): RenderBuffers {
  const width = 6;
  const height = 4;
  const sub = 4;
  const fw = width * sub;
  const fh = height * sub;
  const rgba = new Uint8Array(fw * fh * 4);
  const normal = new Float32Array(fw * fh * 3);
  const depth = new Float32Array(fw * fh).fill(1);
  for (let y = 4; y < 12; y++) {
    for (let x = 8; x < 16; x++) {
      const i = y * fw + x;
      rgba.set([200, 200, 200, 255], i * 4);
      // Складка: левая половина смотрит влево, правая — вправо.
      const nx = crease ? (x < 12 ? -0.7 : 0.7) : 0;
      normal.set([nx, 0, crease ? 0.7 : 1], i * 3);
      depth[i] = 0.4;
    }
  }
  return { width, height, sub, rgba, normal, depth };
}

describe('буферы рендера в ячейки', () => {
  const options = { ...DEFAULT_QUANTIZE, edges: true, dither: 'none' as const };

  it('силуэт по глубине: края квадрата — контур, пустота вокруг — пусто', () => {
    const cells = buffersToCells(squareBuffers(), options);
    const at = (x: number, y: number) => cells.get(keyOf(x, y))?.glyph ?? ' ';
    expect([at(2, 1), at(3, 1), at(2, 2), at(3, 2)].join('')).toMatch(/^[|/\-\\]+$/);
    expect(cells.has(keyOf(0, 0))).toBe(false);
    expect(cells.has(keyOf(5, 3))).toBe(false);
    // Без контуров — символ рампы по яркости.
    const plain = buffersToCells(squareBuffers(), { ...options, edges: false });
    expect(plain.get(keyOf(2, 1))?.glyph).not.toMatch(/^[|/\-\\]$/);
  });

  it('складка по нормали — вертикальная черта посередине, хотя яркость ровная', () => {
    const big = squareBuffers(true);
    const cells = buffersToCells(big, options);
    const middle = [keyOf(2, 1), keyOf(3, 1)].map((k) => cells.get(k)?.glyph);
    expect(middle).toContain('|');
  });

  it('плавный изгиб тонкой трубки — не складка: внутри символы света, контур только по краям', () => {
    // Вертикальная трубка шириной три ячейки: нормаль поворачивается на 160° поперёк неё.
    const width = 7;
    const height = 3;
    const sub = 4;
    const fw = width * sub;
    const rgba = new Uint8Array(fw * height * sub * 4);
    const normal = new Float32Array(fw * height * sub * 3);
    const depth = new Float32Array(fw * height * sub).fill(1);
    for (let y = 0; y < height * sub; y++) {
      for (let x = 8; x < 20; x++) {
        const i = y * fw + x;
        const angle = (((x - 8 + 0.5) / 12) * 160 - 80) * (Math.PI / 180);
        rgba.set([200, 200, 200, 255], i * 4);
        normal.set([Math.sin(angle), 0, Math.cos(angle)], i * 3);
        depth[i] = 0.4 + 0.1 * (1 - Math.cos(angle));
      }
    }
    const cells = buffersToCells({ width, height, sub, rgba, normal, depth }, options);
    const edge = /^[|/\-\\]$/;
    expect(cells.get(keyOf(3, 1))?.glyph).toBeDefined();
    expect(cells.get(keyOf(3, 1))?.glyph).not.toMatch(edge);
    expect(cells.get(keyOf(2, 1))?.glyph).toBe('|');
    expect(cells.get(keyOf(4, 1))?.glyph).toBe('|');
  });
});
