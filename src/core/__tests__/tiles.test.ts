import { describe, expect, it } from 'vitest';
import { keyOf } from '../grid';
import {
  TILE_SIZE,
  mergeTileRanges,
  sameLayout,
  slotCount,
  slotOf,
  tileLayout,
  tileOf,
  tileRect,
  tileSlots,
  tilesFromKeys,
  tilesInRect,
} from '../tiles';

// Ровно два тайла в ряд: удобный случай без обрезки.
const even = tileLayout(64, 32);
// Крайние тайлы обрезаны и по ширине, и по высоте.
const ragged = tileLayout(70, 40);

describe('tileLayout', () => {
  it('считает число тайлов по обеим осям', () => {
    expect({ cols: even.cols, rows: even.rows, count: even.count }).toEqual({
      cols: 2,
      rows: 1,
      count: 2,
    });
    expect({ cols: ragged.cols, rows: ragged.rows }).toEqual({ cols: 3, rows: 2 });
  });

  it('слотов ровно столько, сколько ячеек: лишних нет даже при обрезке', () => {
    expect(slotCount(even)).toBe(64 * 32);
    expect(slotCount(ragged)).toBe(70 * 40);
  });

  it('холст меньше тайла всё равно даёт один тайл', () => {
    const tiny = tileLayout(3, 2);
    expect(tiny.count).toBe(1);
    expect(slotCount(tiny)).toBe(6);
  });
});

describe('tileOf', () => {
  it('находит тайл по координатам', () => {
    expect(tileOf(even, 0, 0)).toBe(0);
    expect(tileOf(even, TILE_SIZE, 0)).toBe(1);
    expect(tileOf(ragged, 0, TILE_SIZE)).toBe(ragged.cols);
  });

  it('за пределами холста тайла нет', () => {
    expect(tileOf(even, -1, 0)).toBe(-1);
    expect(tileOf(even, 64, 0)).toBe(-1);
    expect(tileOf(even, 0, 32)).toBe(-1);
  });
});

describe('slotOf', () => {
  it('слоты внутри холста уникальны и покрывают весь диапазон', () => {
    const seen = new Set<number>();
    for (let y = 0; y < ragged.height; y++) {
      for (let x = 0; x < ragged.width; x++) seen.add(slotOf(ragged, x, y));
    }
    expect(seen.size).toBe(slotCount(ragged));
    expect(Math.min(...seen)).toBe(0);
    expect(Math.max(...seen)).toBe(slotCount(ragged) - 1);
  });

  it('все слоты одного тайла лежат подряд: без этого частичная заливка невозможна', () => {
    for (let tile = 0; tile < ragged.count; tile++) {
      const rect = tileRect(ragged, tile);
      const { start, end } = tileSlots(ragged, tile);
      const slots: number[] = [];
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) slots.push(slotOf(ragged, x, y));
      }
      expect(Math.min(...slots)).toBe(start);
      expect(Math.max(...slots)).toBe(end - 1);
      expect(slots.length).toBe(end - start);
    }
  });

  it('за пределами холста слота нет', () => {
    expect(slotOf(even, 64, 0)).toBe(-1);
  });
});

describe('tileRect', () => {
  it('крайние тайлы обрезаны по холсту', () => {
    expect(tileRect(ragged, 2)).toEqual({ x: 64, y: 0, w: 6, h: 32 });
    expect(tileRect(ragged, ragged.cols)).toEqual({ x: 0, y: 32, w: 32, h: 8 });
  });
});

describe('tilesFromKeys', () => {
  it('мазок внутри одного тайла задевает один тайл', () => {
    const keys = [keyOf(1, 1), keyOf(2, 1), keyOf(3, 1)];
    expect([...tilesFromKeys(even, keys)]).toEqual([0]);
  });

  it('мазок через границу задевает оба тайла', () => {
    const keys = [keyOf(31, 0), keyOf(32, 0)];
    expect([...tilesFromKeys(even, keys)].sort()).toEqual([0, 1]);
  });

  it('ключи за холстом игнорируются', () => {
    expect(tilesFromKeys(even, [keyOf(200, 200)]).size).toBe(0);
  });
});

describe('tilesInRect', () => {
  it('прямоугольник внутри одного тайла даёт один тайл', () => {
    expect(tilesInRect(even, { x: 2, y: 2, w: 4, h: 4 })).toEqual([0]);
  });

  it('прямоугольник на весь холст даёт все тайлы', () => {
    expect(tilesInRect(ragged, { x: 0, y: 0, w: 70, h: 40 })).toHaveLength(ragged.count);
  });

  it('прямоугольник за холстом обрезается, а не выходит за границы', () => {
    const tiles = tilesInRect(even, { x: -50, y: -50, w: 1000, h: 1000 });
    expect(tiles).toHaveLength(even.count);
    expect(Math.min(...tiles)).toBe(0);
  });
});

describe('mergeTileRanges', () => {
  it('соседние тайлы склеиваются в один диапазон', () => {
    expect(mergeTileRanges(even, [0, 1])).toEqual([{ start: 0, end: slotCount(even) }]);
  });

  it('разрозненные тайлы остаются раздельными диапазонами', () => {
    const ranges = mergeTileRanges(ragged, [0, 2]);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual(tileSlots(ragged, 0));
    expect(ranges[1]).toEqual(tileSlots(ragged, 2));
  });

  it('порядок на входе не важен', () => {
    expect(mergeTileRanges(even, [1, 0])).toEqual(mergeTileRanges(even, [0, 1]));
  });

  it('пустой набор даёт пустой список', () => {
    expect(mergeTileRanges(even, [])).toEqual([]);
  });
});

describe('sameLayout', () => {
  it('различает раскладки по размеру холста', () => {
    expect(sameLayout(even, tileLayout(64, 32))).toBe(true);
    expect(sameLayout(even, tileLayout(64, 33))).toBe(false);
  });
});
