import { type Cell, makeCell } from '../cell';
import { type Document, addLayer, createDocument, createLayer, setLayerCells } from '../document';
import { type CellGrid, type CellKey, keyOf } from '../grid';

/**
 * Синтетические документы для бенчмарков. Заполнение детерминировано seed'ом, поэтому прогоны
 * сравнимы между собой и между машинами.
 */
export interface BenchSize {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  /** Доля непустых ячеек слоя, 0..1. */
  readonly fill: number;
}

/**
 * Три точки, покрывающие реальные режимы работы: комфортный размер, тяжёлый размер и большой
 * разреженный холст, на котором видна разница между «по площади» и «по непустым ячейкам».
 */
export const BENCH_SIZES: readonly BenchSize[] = [
  { label: '256x144 плотный', width: 256, height: 144, fill: 0.9 },
  { label: '512x288 плотный', width: 512, height: 288, fill: 0.9 },
  { label: '1024x1024 разреженный', width: 1024, height: 1024, fill: 0.02 },
];

const GLYPHS = '.:*#%@ABCDEF';
const COLORS = ['#ffffff', '#ff004d', '#ffa300', '#00e436', '#29adff', '#83769c'];

/** Линейный конгруэнтный генератор: воспроизводимый и достаточно равномерный для заполнения. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function benchGrid(size: BenchSize, seed: number): CellGrid {
  const next = rng(seed);
  const grid = new Map<CellKey, Cell>();
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      if (next() > size.fill) continue;
      const glyph = GLYPHS[Math.floor(next() * GLYPHS.length)];
      const fg = COLORS[Math.floor(next() * COLORS.length)];
      // Примерно у трети ячеек есть фон: он идёт по отдельному пути в композиторе.
      const bg = next() < 0.33 ? COLORS[Math.floor(next() * COLORS.length)] : null;
      grid.set(keyOf(x, y), makeCell(glyph, fg, bg));
    }
  }
  return grid;
}

/** Документ из трёх слоёв: один плотный снизу и два разреженных сверху, как в реальной работе. */
export function benchDocument(size: BenchSize): Document {
  let doc = createDocument({ width: size.width, height: size.height, name: size.label });
  doc = setLayerCells(doc, doc.layers[0].id, benchGrid(size, 1));
  const sparse = { ...size, fill: size.fill * 0.25 };
  for (let i = 0; i < 2; i++) {
    const layer = createLayer(`Layer ${i + 2}`);
    doc = addLayer(doc, layer);
    doc = setLayerCells(doc, layer.id, benchGrid(sparse, 2 + i));
  }
  return doc;
}

/** Мазок кисти: подряд идущие ячейки одной строки, как при протаскивании указателя. */
export function benchStroke(size: BenchSize, length: number): Map<CellKey, Cell | null> {
  const edits = new Map<CellKey, Cell | null>();
  const y = Math.floor(size.height / 2);
  for (let i = 0; i < length && i < size.width; i++) {
    edits.set(keyOf(i, y), makeCell('#', '#ffffff'));
  }
  return edits;
}
