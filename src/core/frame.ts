import type { Affine } from './affine';
import type { Animation } from './animation';
import { type CellBuffer, createCellBuffer } from './cellBuffer';
import {
  type DrawTarget,
  type Ghost,
  type Preview,
  canRebuildTiles,
  clearBuffer,
  drawDocument,
} from './compositor';
import type { Document } from './document';
import { evaluate } from './evaluate';
import { type GlyphBatch, GlyphBatchBuilder, pushObjectGlyphs } from './instances';
import type { SceneObject } from './object';
import { type TileLayout, tileLayout, tileRect } from './tiles';

export type FramePass =
  | { readonly kind: 'cells'; readonly buffer: CellBuffer }
  | { readonly kind: 'glyphs'; readonly batch: GlyphBatch };

/**
 * Вычисленный кадр для экрана и экспорта в пиксели (DESIGN.md, раздел 2, «Порядок отрисовки»).
 * Подряд идущие ячейки сведены в один буфер и рисуются одним вызовом. Свободные объекты —
 * повёрнутые, отмасштабированные — уходят потоком символов в отдельный проход ровно там, где
 * они лежат по порядку отрисовки. Документ без таких объектов даёт один проход.
 */
export interface ComposedFrame {
  readonly width: number;
  readonly height: number;
  readonly passes: readonly FramePass[];
  /** Тайлы, пересобранные в проходах ячеек. null — пересобрано всё, и залить надо всё. */
  readonly dirty: readonly number[] | null;
}

type OpenPass =
  | { readonly kind: 'cells'; readonly buffer: CellBuffer }
  | { readonly kind: 'glyphs'; readonly builder: GlyphBatchBuilder };

/** Проходы по мере отрисовки: новый открывается, когда ячейки сменяются символами и обратно. */
class PassTarget implements DrawTarget {
  readonly passes: OpenPass[] = [];
  private cellPasses = 0;

  constructor(
    private readonly doc: Document,
    private readonly reuse: readonly CellBuffer[],
    private readonly layout: TileLayout,
    private readonly tiles: ReadonlySet<number> | null,
  ) {}

  cells(): CellBuffer {
    const last = this.passes.at(-1);
    if (last?.kind === 'cells') return last.buffer;
    const reused = this.reuse[this.cellPasses++];
    // Прошлый буфер чистится только в пересобираемых тайлах: остальное в нём и есть этот кадр.
    if (reused) clearBuffer(reused, this.layout, this.tiles);
    const buffer = reused ?? createCellBuffer(this.doc.width, this.doc.height);
    this.passes.push({ kind: 'cells', buffer });
    return buffer;
  }

  free(obj: SceneObject, matrix: Affine, opacity: number, time: number): void {
    let last = this.passes.at(-1);
    if (last?.kind !== 'glyphs') {
      last = { kind: 'glyphs', builder: new GlyphBatchBuilder() };
      this.passes.push(last);
    }
    pushObjectGlyphs(last.builder, obj, matrix, opacity, time);
  }
}

const cellBuffersOf = (passes: readonly FramePass[]): CellBuffer[] =>
  passes.flatMap((p) => (p.kind === 'cells' ? [p.buffer] : []));

/**
 * В одном буфере символ верхнего слоя заменяет символ нижнего. Проходы на GPU накладываются, и
 * без этой правки нижний символ просвечивал бы сквозь верхний там, где раньше его не было видно.
 * Фоны не трогаются: их наложение одинаково что в буфере, что на экране.
 */
function hideCoveredGlyphs(
  buffers: readonly CellBuffer[],
  layout: TileLayout,
  tiles: ReadonlySet<number> | null,
): void {
  if (buffers.length < 2) return;
  const span = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      let covered = false;
      for (let k = buffers.length - 1; k >= 0; k--) {
        const buf = buffers[k];
        if (buf.glyphs[i] === '') continue;
        if (!covered) {
          covered = true;
          continue;
        }
        buf.glyphs[i] = '';
        buf.fg.fill(0, i * 4, i * 4 + 4);
      }
    }
  };
  const width = buffers[0].width;
  if (tiles === null) {
    span(0, width * buffers[0].height);
    return;
  }
  for (const tile of tiles) {
    const rect = tileRect(layout, tile);
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      span(y * width + rect.x, y * width + rect.x + rect.w);
    }
  }
}

function drawFrame(
  doc: Document,
  preview: Preview | null,
  ghosts: readonly Ghost[],
  time: number,
  reuse: readonly CellBuffer[],
  tiles: ReadonlySet<number> | null,
): ComposedFrame {
  const layout = tileLayout(doc.width, doc.height);
  const target = new PassTarget(doc, reuse, layout, tiles);
  // Первый проход всегда ячейки, даже если все слои скрыты: пустой холст — тоже кадр.
  target.cells();
  for (const ghost of ghosts) {
    drawDocument(target, ghost.doc, null, ghost.opacity, time, layout, tiles);
  }
  drawDocument(target, doc, preview, 1, time, layout, tiles);
  const passes = target.passes.map((p): FramePass =>
    p.kind === 'cells' ? p : { kind: 'glyphs', batch: p.builder.finish() },
  );
  hideCoveredGlyphs(cellBuffersOf(passes), layout, tiles);
  return { width: doc.width, height: doc.height, passes, dirty: tiles ? [...tiles] : null };
}

const sameShape = (a: readonly FramePass[], b: readonly FramePass[]): boolean =>
  a.length === b.length && a.every((p, i) => p.kind === b[i].kind);

/**
 * Вычисляет кадр для экрана. Аргументы те же, что у `composite`, только вместо буфера — прошлый
 * кадр: его буферы ячеек переиспользуются, а с `dirty` пересобираются только эти тайлы.
 *
 * Частичная пересборка годится, лишь пока проходы лежат так же, как в прошлом кадре: иначе
 * буферы не совпадут по смыслу. Если объект только что стал свободным или перестал им быть,
 * кадр пересобирается целиком. Такое бывает на жесте трансформа, а не на мазке кисти.
 */
export function composeFrame(
  doc: Document,
  preview: Preview | null = null,
  previous: ComposedFrame | null = null,
  ghosts: readonly Ghost[] = [],
  time = 0,
  dirty?: Iterable<number> | null,
): ComposedFrame {
  const sameSize = previous && previous.width === doc.width && previous.height === doc.height;
  const reuse = sameSize ? cellBuffersOf(previous.passes) : [];
  const tiles = dirty && reuse.length > 0 && canRebuildTiles(doc, ghosts) ? new Set(dirty) : null;
  const frame = drawFrame(doc, preview, ghosts, time, reuse, tiles);
  if (tiles === null || (previous && sameShape(frame.passes, previous.passes))) return frame;
  return drawFrame(doc, preview, ghosts, time, reuse, null);
}

/**
 * Кадр сцены в момент `time` без служебного: без превью, кальки и черновика. Так рендерит
 * экспорт; экран зовёт тот же `composeFrame` над тем же `evaluate`, добавляя только служебное.
 */
export function composeAt(
  anim: Animation,
  time: number,
  previous: ComposedFrame | null = null,
): ComposedFrame {
  return composeFrame(evaluate(anim, time), null, previous, [], time);
}
