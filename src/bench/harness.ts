import { type Document, updateLayer } from '../core/document';
import { type Preview, composite } from '../core/compositor';
import { createEffect } from '../core/effects';
import type { CellBuffer } from '../core/cellBuffer';
import { type TileLayout, tileLayout, tilesFromKeys } from '../core/tiles';
import { BENCH_SIZES, type BenchSize, benchDocument } from '../core/__bench__/fixtures';
import { type Cell, makeCell } from '../core/cell';
import { type CellKey, keyOf } from '../core/grid';
import { GlyphAtlas } from '../render/font/GlyphAtlas';
import { SceneView } from '../render/SceneView';

export interface Measurement {
  readonly label: string;
  /** Среднее время одной операции в миллисекундах. */
  readonly mean: number;
  /** Худший случай: по нему видно, будет ли заметно подёргивание. */
  readonly p95: number;
  readonly samples: number;
  /** Пояснение, что именно значит число. */
  readonly note?: string;
}

export interface SizeReport {
  readonly size: BenchSize;
  readonly measurements: readonly Measurement[];
}

/** Сколько ждать первого кадра, прежде чем признать, что их не будет. */
const FRAME_TIMEOUT_MS = 6000;

function summarize(label: string, times: number[], note?: string): Measurement {
  if (times.length === 0) {
    return {
      label,
      mean: 0,
      p95: 0,
      samples: 0,
      note: 'замер не состоялся: вкладка должна оставаться видимой',
    };
  }
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  return {
    label,
    mean,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
    samples: times.length,
    note,
  };
}

/** Повторяет работу и возвращает времена. Первые прогоны отбрасываются: они греют код и кэши. */
function timeIt(run: () => void, iterations: number, warmup = 5): number[] {
  for (let i = 0; i < warmup; i++) run();
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return times;
}

/**
 * Время между кадрами, пока на каждом кадре выполняется `work`. Меряется именно так, а не
 * секундомером вокруг вызова: отрисовка на GPU происходит асинхронно, и её стоимость видна
 * только по тому, как часто браузер успевает выдавать кадры.
 */
function measureFrames(work: (frame: number) => void, frames: number): Promise<number[]> {
  return new Promise((resolve) => {
    const deltas: number[] = [];
    let previous = 0;
    let index = 0;
    let finished = false;
    let throttled = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      // Скрытая вкладка получает примерно один кадр в секунду вместо шестидесяти. Такие числа
      // выглядят как чудовищно медленный рендер, хотя рендер тут ни при чём, поэтому замер
      // признаётся несостоявшимся, а не отчитывается выдумкой.
      resolve(throttled ? [] : deltas);
    };
    // В скрытой вкладке кадров нет вовсе, и без этого замер ждал бы вечно.
    const guard = setTimeout(finish, FRAME_TIMEOUT_MS);
    const step = (now: number): void => {
      if (finished) return;
      if (document.hidden) throttled = true;
      if (previous !== 0) deltas.push(now - previous);
      previous = now;
      work(index);
      index += 1;
      if (index < frames) {
        requestAnimationFrame(step);
      } else {
        clearTimeout(guard);
        finish();
      }
    };
    requestAnimationFrame(step);
  });
}

/** Готовит документ, кадр и вьюпорт под один размер. */
function setup(view: SceneView, size: BenchSize) {
  const doc = benchDocument(size);
  const layout = tileLayout(size.width, size.height);
  const buffer = composite(doc);
  view.setDocument(doc.width, doc.height, doc.background);
  view.setCamera(view.fitCamera(doc.width, doc.height));
  view.setBuffer(buffer);
  return { doc, layout, buffer };
}

const BRUSH_LENGTH = 8;

/** Мазок, ползущий по холсту: имитирует рисование, при котором меняется один-два тайла. */
function strokeAt(doc: Document, layout: TileLayout, frame: number) {
  const y = Math.floor(doc.height / 2);
  const start = frame % Math.max(1, doc.width - BRUSH_LENGTH);
  const edits = new Map<CellKey, Cell | null>();
  for (let i = 0; i < BRUSH_LENGTH; i++) {
    edits.set(keyOf(Math.min(doc.width - 1, start + i), y), makeCell('#', '#ffffff'));
  }
  return {
    preview: { layerId: doc.layers[doc.layers.length - 1].id, edits } satisfies Preview,
    tiles: [...tilesFromKeys(layout, edits.keys())],
  };
}

export async function runSize(view: SceneView, size: BenchSize): Promise<SizeReport> {
  const { doc, layout, buffer } = setup(view, size);
  const measurements: Measurement[] = [];

  const strokeTiles = strokeAt(doc, layout, 0);
  measurements.push(
    summarize(
      'composite, весь холст',
      timeIt(() => composite(doc, null, buffer), 30),
      'полная пересборка кадра на CPU',
    ),
  );
  measurements.push(
    summarize(
      'composite, задетые тайлы',
      timeIt(() => composite(doc, strokeTiles.preview, buffer, [], 0, strokeTiles.tiles), 200),
      'то, что происходит на каждое движение кисти',
    ),
  );
  measurements.push(
    summarize(
      'заливка GPU, весь холст',
      timeIt(() => view.setBuffer(buffer), 30),
      'перенос кадра в атрибуты инстансов',
    ),
  );
  measurements.push(
    summarize(
      'заливка GPU, один тайл',
      timeIt(() => view.setBuffer(buffer, strokeTiles.tiles), 200),
      'то же во время рисования',
    ),
  );

  // Отрисовка как таковая: ставим команды и дожидаемся GPU. Не зависит от кадров браузера,
  // поэтому меряется одинаково и в видимой вкладке, и в фоновой.
  measurements.push(
    summarize(
      'отрисовка, ожидание GPU',
      timeIt(() => view.renderNow(true), 20),
      'сколько стоит нарисовать весь холст',
    ),
  );
  measurements.push(
    summarize(
      'полный шаг рисования',
      timeIt(() => {
        const stroke = strokeAt(doc, layout, Math.floor(Math.random() * doc.width));
        const next = composite(doc, stroke.preview, buffer, [], 0, stroke.tiles);
        view.setBuffer(next, stroke.tiles);
        view.renderNow(true);
      }, 40),
      'сборка, заливка и отрисовка одного движения кисти',
    ),
  );

  // Кадр целиком: сборка, заливка и отрисовка, как при настоящем рисовании.
  const drawing = await measureFrames((frame) => {
    const stroke = strokeAt(doc, layout, frame);
    const next = composite(doc, stroke.preview, buffer, [], 0, stroke.tiles);
    view.setBuffer(next, stroke.tiles);
  }, 60);
  measurements.push(
    summarize('кадр при рисовании', drawing, 'время между кадрами браузера, включая отрисовку'),
  );

  // То же, но с активным эффектом: он запрещает частичную пересборку.
  const withFire = updateLayer(doc, doc.layers[0].id, { effects: [createEffect('fire', 'bench')] });
  view.setBuffer(composite(withFire, null, buffer, [], 0));
  const fire = await measureFrames((frame) => {
    const next = composite(withFire, null, buffer, [], frame * 33);
    view.setBuffer(next);
  }, 40);
  measurements.push(summarize('кадр с огнём', fire, 'эффект пересобирает слой целиком'));

  return { size, measurements };
}

export interface HarnessHandle {
  readonly view: SceneView;
  dispose(): void;
}

export function createHarness(container: HTMLElement, atlas: GlyphAtlas): HarnessHandle {
  const view = new SceneView(container, atlas);
  return { view, dispose: () => view.dispose() };
}

export async function runAll(
  container: HTMLElement,
  atlas: GlyphAtlas,
  onProgress: (label: string) => void,
): Promise<SizeReport[]> {
  const harness = createHarness(container, atlas);
  const reports: SizeReport[] = [];
  try {
    for (const size of BENCH_SIZES) {
      onProgress(size.label);
      reports.push(await runSize(harness.view, size));
    }
  } finally {
    harness.dispose();
  }
  return reports;
}

export function frameBudget(mean: number): string {
  if (mean <= 0) return '—';
  return `${Math.round(1000 / mean)} кадров/с`;
}

export { BENCH_SIZES };
export type { CellBuffer };
