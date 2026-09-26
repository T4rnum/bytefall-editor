import { describe, expect, it } from 'vitest';
import { sheetAtlas, sheetLayouts } from '../spriteSheet';

describe('лист спрайтов', () => {
  it('кадры ложатся в лист, близкий к квадрату', () => {
    expect(sheetLayouts(10, 64, 32)).toEqual([
      { columns: 4, rows: 3, frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    ]);
  });

  it('кадры сверх предела уходят на следующий лист, у каждого листа своя сторона', () => {
    // В лист 256×256 влезает 4×8 кадров 64×32: 32 штуки.
    const sheets = sheetLayouts(70, 64, 32, 256);
    expect(sheets.map((s) => s.frames.length)).toEqual([32, 32, 6]);
    expect(sheets[0]).toMatchObject({ columns: 4, rows: 8 });
    expect(sheets[2].frames[0]).toBe(64);
    for (const s of sheets) {
      expect(s.columns * 64).toBeLessThanOrEqual(256);
      expect(s.rows * 32).toBeLessThanOrEqual(256);
    }
  });

  it('кадр шире предела ложится в один столбец: лист не шире самого кадра', () => {
    expect(sheetLayouts(2, 5000, 100, 4096)).toEqual([{ columns: 1, rows: 2, frames: [0, 1] }]);
  });

  it('атлас в формате Aseprite: прямоугольники по сетке, длительности, имя листа', () => {
    const [layout] = sheetLayouts(3, 16, 8);
    const atlas = sheetAtlas(layout, { w: 16, h: 8 }, [100, 200, 300], 'герой', 'герой-0.png') as {
      frames: { filename: string; frame: object; duration: number }[];
      meta: { image: string; size: object };
    };
    expect(atlas.frames.map((f) => f.frame)).toEqual([
      { x: 0, y: 0, w: 16, h: 8 },
      { x: 16, y: 0, w: 16, h: 8 },
      { x: 0, y: 8, w: 16, h: 8 },
    ]);
    expect(atlas.frames.map((f) => f.duration)).toEqual([100, 200, 300]);
    expect(atlas.frames[2].filename).toBe('герой 2');
    expect(atlas.meta).toMatchObject({ image: 'герой-0.png', size: { w: 32, h: 16 } });
  });
});
