import { describe, expect, it } from 'vitest';
import { keyOf } from '../grid';
import {
  DEFAULT_QUANTIZE,
  PALETTE_PRESETS,
  type QuantizeOptions,
  applyTone,
  cellsHighFor,
  ditherThreshold,
  edgeGlyphs,
  imageToCells,
  nearestColor,
  preparePalette,
  rampFromCoverage,
  rampLevel,
  sampleImage,
  subsamplesFor,
  toOklab,
} from '../quantize';
import { gradient, makeImage } from './helpers/images';

const plain: QuantizeOptions = { ...DEFAULT_QUANTIZE, dither: 'none' };

describe('sampleImage', () => {
  it('усредняет цвет ячейки с весом по альфе: прозрачное не темнит цвет', () => {
    // Слева красный непрозрачный, справа прозрачный чёрный: ячейка 1×1 из 2×1 пикселей.
    const image = makeImage(2, 1, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    const samples = sampleImage(image, 1, 1);
    expect([...samples.color]).toEqual([1, 0, 0]);
    expect(samples.alpha[0]).toBeCloseTo(0.5);
  });

  it('маленькая картинка растягивается: каждый образец берёт ближайший пиксель', () => {
    const image = makeImage(2, 2, (x, y) => (x === y ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    const samples = sampleImage(image, 4, 4);
    expect(samples.color[0]).toBe(1);
    expect(samples.color[(0 * 4 + 3) * 3]).toBe(0);
    expect(samples.color[(3 * 4 + 3) * 3]).toBe(1);
  });

  it('высота держит пропорции, мелкая сетка не выходит за потолок памяти', () => {
    expect(cellsHighFor({ width: 800, height: 600 }, 80)).toBe(60);
    expect(cellsHighFor({ width: 1000, height: 1 }, 10)).toBe(1);
    expect(subsamplesFor(160, 90)).toBe(4);
    expect(subsamplesFor(1024, 1024)).toBe(2);
  });
});

describe('яркость и дизеринг', () => {
  it('без настроек яркость проходит как есть, контраст и гамма её двигают', () => {
    const tone = { gamma: 1, contrast: 1, brightness: 0 };
    expect(applyTone(0.3, tone)).toBeCloseTo(0.3);
    expect(applyTone(0.75, { ...tone, contrast: 2 })).toBe(1);
    expect(applyTone(0.25, { ...tone, gamma: 2 })).toBeCloseTo(0.5);
    expect(applyTone(0.5, { ...tone, brightness: -1 })).toBe(0);
  });

  it('ступень рампы: без дизеринга — округление, с порогом — выбор между соседями', () => {
    expect(rampLevel(0, 10, 0.5)).toBe(0);
    expect(rampLevel(1, 10, 0.5)).toBe(9);
    expect(rampLevel(0.5, 3, 0.5)).toBe(1);
    // 0.3 · 9 = 2.7: дробная часть 0.7 выше порога 0.5 — третья ступень, ниже порога 0.9 — вторая.
    expect(rampLevel(0.3, 10, 0.5)).toBe(3);
    expect(rampLevel(0.3, 10, 0.9)).toBe(2);
  });

  it('пороги Байера — шестнадцать разных чисел внутри (0, 1), шум тоже внутри', () => {
    const bayer = new Set<number>();
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) bayer.add(ditherThreshold('bayer', x, y));
    expect(bayer.size).toBe(16);
    for (const t of bayer) expect(t > 0 && t < 1).toBe(true);
    expect(ditherThreshold('bayer', 5, 6)).toBe(ditherThreshold('bayer', 1, 2));
    const noise = ditherThreshold('noise', 17, 3);
    expect(noise >= 0 && noise < 1).toBe(true);
    expect(ditherThreshold('none', 3, 3)).toBe(0.5);
  });
});

describe('рампа из шрифта', () => {
  it('ступени идут равномерно по чернилам, повторы и пробел не теряются', () => {
    const ink: Record<string, number> = {
      '.': 0.1,
      ':': 0.2,
      '-': 0.21,
      '+': 0.5,
      '#': 0.8,
      '@': 1,
    };
    const ramp = rampFromCoverage(' .:-+#@', (g) => ink[g] ?? 0, 5);
    // Цели 0, 0.25, 0.5, 0.75, 1: ближайшие — пробел, «-», «+», «#», «@».
    expect(ramp).toBe(' -+#@');
  });
});

describe('палитры', () => {
  it('OKLab белого — яркость 1 без оттенка', () => {
    const [l, a, b] = toOklab(1, 1, 1);
    expect(l).toBeCloseTo(1, 3);
    expect(Math.abs(a) + Math.abs(b)).toBeLessThan(1e-3);
  });

  it('ближайший цвет выбирается по восприятию', () => {
    const pico = preparePalette(PALETTE_PRESETS.find((p) => p.id === 'pico8')!.colors);
    expect(nearestColor(pico, 1, 0, 0)).toBe('#ff004d');
    expect(nearestColor(pico, 0.05, 0.05, 0.05)).toBe('#000000');
    expect(nearestColor(pico, 0.2, 0.7, 1)).toBe('#29adff');
  });
});

describe('контуры', () => {
  const edgesOf = (image: ReturnType<typeof makeImage>, cells: number) => {
    const height = cellsHighFor(image, cells);
    return {
      glyphs: edgeGlyphs(sampleImage(image, cells, height), { threshold: 0.3, strength: 0.5 }),
      height,
    };
  };

  it('вертикальная граница даёт «|», горизонтальная «-»', () => {
    const vertical = makeImage(16, 16, (x) => (x < 8 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const { glyphs } = edgesOf(vertical, 4);
    expect(glyphs[1 * 4 + 1]).toBe('|');
    expect(glyphs[1 * 4 + 0]).toBeNull();
    const horizontal = makeImage(16, 16, (_, y) => (y < 8 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(edgesOf(horizontal, 4).glyphs[1 * 4 + 2]).toBe('-');
  });

  it('диагонали по направлению: снизу-слева вверх-вправо — «/», сверху-слева вниз-вправо — «\\»', () => {
    const slash = makeImage(16, 16, (x, y) => (x + y < 16 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(edgesOf(slash, 4).glyphs[1 * 4 + 2]).toBe('/');
    const back = makeImage(16, 16, (x, y) => (x > y ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(edgesOf(back, 4).glyphs[1 * 4 + 1]).toBe('\\');
  });
});

describe('quantize', () => {
  it('прозрачные ячейки пропускаются, самая тёмная ступень — пустая ячейка', () => {
    const image = makeImage(4, 1, (x) => [255, 255, 255, x < 2 ? 255 : 0]);
    const { cells } = imageToCells(image, 4, plain);
    expect(cells.get(keyOf(0, 0))?.glyph).toBe('@');
    expect(cells.has(keyOf(3, 0))).toBe(false);
    const dark = imageToCells(
      makeImage(2, 1, () => [0, 0, 0, 255]),
      2,
      plain,
    );
    expect(dark.cells.size).toBe(0);
  });

  it('цветные ячейки — только фон, «символы на фоне» — приглушённый фон под ярким символом', () => {
    const red = makeImage(2, 2, () => [200, 0, 0, 255]);
    const blocks = imageToCells(red, 1, { ...plain, background: 'blocks' }).cells.get(keyOf(0, 0));
    expect(blocks).toMatchObject({ glyph: '', bg: '#c80000' });
    const shaded = imageToCells(red, 1, { ...plain, background: 'shaded' }).cells.get(keyOf(0, 0));
    expect(shaded?.fg).toBe('#ff0000');
    expect(shaded?.bg).toBe('#460000');
  });

  it('инверсия для светлого холста: тёмное становится плотным', () => {
    const black = makeImage(1, 1, () => [0, 0, 0, 255]);
    expect(imageToCells(black, 1, { ...plain, invert: true }).cells.get(keyOf(0, 0))?.glyph).toBe(
      '@',
    );
  });

  it('палитра приводит цвета к своим, без палитры цвет — как у картинки', () => {
    const teal = makeImage(1, 1, () => [40, 170, 250, 255]);
    const own = imageToCells(teal, 1, { ...plain, vivid: false }).cells.get(keyOf(0, 0));
    expect(own?.fg).toBe('#28aafa');
    const gb = PALETTE_PRESETS.find((p) => p.id === 'gameboy')!.colors;
    const mapped = imageToCells(teal, 1, { ...plain, palette: gb }).cells.get(keyOf(0, 0));
    expect(gb).toContain(mapped?.fg);
  });

  it('градиент проходит всю рампу слева направо', () => {
    const { cells, width } = imageToCells(gradient(100, 10), 10, plain);
    const row = Array.from({ length: width }, (_, x) => cells.get(keyOf(x, 0))?.glyph ?? ' ').join(
      '',
    );
    expect(row).toBe(' .:-=+*#%@');
  });
});
