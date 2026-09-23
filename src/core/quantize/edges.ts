import type { CellSamples } from './sample';

export interface EdgeOptions {
  /** 0..1: насколько резким должен быть перепад яркости, чтобы считаться контуром. */
  readonly threshold: number;
  /**
   * 0..1: сколько контура нужно ячейке, чтобы стать контуром. При нуле — две линии образцов через
   * всю ячейку, при 0.5 — одна, при единице хватает одного образца.
   */
  readonly strength: number;
}

/**
 * Символ контура по направлению градиента, шагами по 45°. Градиент перпендикулярен линии
 * контура: перепад слева направо даёт вертикальную черту. Ось Y смотрит вниз, поэтому градиент
 * вниз-вправо — это линия снизу-слева вверх-вправо, то есть «/».
 */
const EDGE_GLYPHS = ['|', '/', '-', '\\'] as const;

/** Модуль оператора Собеля на ровной границе чёрного и белого: к нему приводится порог. */
const SOBEL_EDGE = 4;

/**
 * Для каждой ячейки — символ контура или null. Оператор Собеля считается на мелкой сетке
 * образцов, внутри ячейки голосуют образцы с перепадом выше порога, каждый своим весом, и
 * побеждает направление с наибольшим весом. Без контуров модель выглядит шумом, с ними —
 * штриховым рисунком (DESIGN.md, раздел 5).
 */
export function edgeGlyphs(samples: CellSamples, options: EdgeOptions): (string | null)[] {
  const { width, height, sub, fine } = samples;
  const fw = width * sub;
  const fh = height * sub;
  const votes = new Float32Array(width * height * 4);
  const counts = new Uint16Array(width * height);
  const threshold = options.threshold * SOBEL_EDGE;
  const thresholdSq = threshold * threshold;
  // Соседи у края берутся с самого края: за картинкой нет перепада, и ложного контура тоже.
  const row = (y: number): number => Math.min(fh - 1, Math.max(0, y)) * fw;
  for (let y = 0; y < fh; y++) {
    const up = row(y - 1);
    const mid = row(y);
    const down = row(y + 1);
    const cellRow = Math.floor(y / sub) * width;
    for (let x = 0; x < fw; x++) {
      const l = x > 0 ? x - 1 : 0;
      const r = x < fw - 1 ? x + 1 : fw - 1;
      const gx =
        fine[up + r] +
        2 * fine[mid + r] +
        fine[down + r] -
        (fine[up + l] + 2 * fine[mid + l] + fine[down + l]);
      const gy =
        fine[down + l] +
        2 * fine[down + x] +
        fine[down + r] -
        (fine[up + l] + 2 * fine[up + x] + fine[up + r]);
      const magnitudeSq = gx * gx + gy * gy;
      if (magnitudeSq <= thresholdSq) continue;
      const angle = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
      const bin = Math.round(angle / 45) % 4;
      const cell = cellRow + Math.floor(x / sub);
      votes[cell * 4 + bin] += Math.sqrt(magnitudeSq);
      counts[cell]++;
    }
  }
  // Ровная граница задевает одну-две линии образцов ячейки: мерить удобно в линиях.
  const needed = Math.max(1, Math.round(2 * sub * (1 - options.strength)));
  const out: (string | null)[] = new Array<string | null>(width * height).fill(null);
  for (let cell = 0; cell < width * height; cell++) {
    if (counts[cell] < needed) continue;
    let best = 0;
    for (let bin = 1; bin < 4; bin++) {
      if (votes[cell * 4 + bin] > votes[cell * 4 + best]) best = bin;
    }
    out[cell] = EDGE_GLYPHS[best];
  }
  return out;
}
