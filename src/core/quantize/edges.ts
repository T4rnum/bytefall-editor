import type { CellSamples } from './sample';

export interface EdgeOptions {
  /**
   * 0..1: насколько резким должен быть перепад яркости, чтобы считаться контуром. У рендера 3D
   * он же задаёт складку: единица — прямой угол между гранями.
   */
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

/** Голоса образцов по ячейкам: вес каждого из четырёх направлений и число образцов. */
interface Votes {
  readonly width: number;
  readonly fw: number;
  readonly fh: number;
  readonly sub: number;
  readonly weights: Float32Array;
  readonly counts: Uint16Array;
  /** Образцы, уже отдавшие голос: складка не голосует там, где уже есть силуэт. */
  readonly voted: Uint8Array;
}

function vote(v: Votes, x: number, y: number, bin: number, weight: number): void {
  const cell = Math.floor(y / v.sub) * v.width + Math.floor(x / v.sub);
  v.weights[cell * 4 + bin] += weight;
  v.counts[cell]++;
  v.voted[y * v.fw + x] = 1;
}

/**
 * Перепад канала оператором Собеля: по яркости у картинки, по глубине у рендера 3D. Вес
 * голоса — во сколько раз перепад выше порога.
 */
function sobelVotes(v: Votes, f: Float32Array, threshold: number): void {
  const { fw, fh } = v;
  const limit = threshold * SOBEL_EDGE;
  const limitSq = limit * limit;
  // Соседи у края берутся с самого края: за картинкой нет перепада, и ложного контура тоже.
  const row = (y: number): number => Math.min(fh - 1, Math.max(0, y)) * fw;
  for (let y = 0; y < fh; y++) {
    const up = row(y - 1);
    const mid = row(y);
    const down = row(y + 1);
    for (let x = 0; x < fw; x++) {
      const l = x > 0 ? x - 1 : 0;
      const r = x < fw - 1 ? x + 1 : fw - 1;
      const gx =
        f[up + r] + 2 * f[mid + r] + f[down + r] - (f[up + l] + 2 * f[mid + l] + f[down + l]);
      const gy =
        f[down + l] + 2 * f[down + x] + f[down + r] - (f[up + l] + 2 * f[up + x] + f[up + r]);
      const magnitudeSq = gx * gx + gy * gy;
      if (magnitudeSq <= limitSq) continue;
      const angle = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
      vote(v, x, y, Math.round(angle / 45) % 4, Math.sqrt(magnitudeSq) / limit);
    }
  }
}

/**
 * Складка по нормалям: образец сравнивает соседей напротив друг друга — по горизонтали,
 * вертикали и двум диагоналям. Угол между ними, а не скорость изменения нормали: плавный изгиб
 * тонкой трубки поворачивает нормаль на каждом образце понемногу и складкой не считается.
 * Линия складки идёт вдоль той пары, что изменилась меньше всех.
 */
function creaseVotes(v: Votes, normal: Float32Array, threshold: number): void {
  const { fw, fh } = v;
  const limit = 1 - Math.cos((threshold * Math.PI) / 2);
  const at = (x: number, y: number): number =>
    (Math.min(fh - 1, Math.max(0, y)) * fw + Math.min(fw - 1, Math.max(0, x))) * 3;
  const empty = (a: number): boolean =>
    normal[a] === 0 && normal[a + 1] === 0 && normal[a + 2] === 0;
  // Косинус угла между нормалями; с пустым образцом — не складка: силуэт найдёт глубина.
  const cos = (a: number, b: number): number =>
    empty(a) || empty(b)
      ? 1
      : normal[a] * normal[b] + normal[a + 1] * normal[b + 1] + normal[a + 2] * normal[b + 2];
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      if (v.voted[y * fw + x] || empty((y * fw + x) * 3)) continue;
      // Пары вдоль направлений линии: |, /, -, \.
      const p0 = cos(at(x, y - 1), at(x, y + 1));
      const p1 = cos(at(x + 1, y - 1), at(x - 1, y + 1));
      const p2 = cos(at(x - 1, y), at(x + 1, y));
      const p3 = cos(at(x - 1, y - 1), at(x + 1, y + 1));
      const change = 1 - Math.min(p0, p1, p2, p3);
      if (change <= limit) continue;
      const most = Math.max(p0, p1, p2, p3);
      vote(v, x, y, most === p0 ? 0 : most === p1 ? 1 : most === p2 ? 2 : 3, change / limit);
    }
  }
}

/**
 * Для каждой ячейки — символ контура или null. Перепады ищутся на мелкой сетке образцов: у
 * картинки по яркости, у рендера 3D по геометрии — силуэт по глубине, складка по нормалям.
 * Внутри ячейки голосуют образцы с перепадом выше порога, каждый своим весом, и побеждает
 * направление с наибольшим весом. Без контуров модель выглядит шумом, с ними — штриховым
 * рисунком (DESIGN.md, раздел 5).
 */
export function edgeGlyphs(samples: CellSamples, options: EdgeOptions): (string | null)[] {
  const { width, height, sub, geometry } = samples;
  const fw = width * sub;
  const fh = height * sub;
  const votes: Votes = {
    width,
    fw,
    fh,
    sub,
    weights: new Float32Array(width * height * 4),
    counts: new Uint16Array(width * height),
    voted: new Uint8Array(fw * fh),
  };
  sobelVotes(votes, geometry?.depth ?? samples.fine, options.threshold);
  if (geometry) creaseVotes(votes, geometry.normal, options.threshold);
  // Ровная граница задевает одну-две линии образцов ячейки: мерить удобно в линиях.
  const needed = Math.max(1, Math.round(2 * sub * (1 - options.strength)));
  const out: (string | null)[] = new Array<string | null>(width * height).fill(null);
  for (let cell = 0; cell < width * height; cell++) {
    if (votes.counts[cell] < needed) continue;
    let best = 0;
    for (let bin = 1; bin < 4; bin++) {
      if (votes.weights[cell * 4 + bin] > votes.weights[cell * 4 + best]) best = bin;
    }
    out[cell] = EDGE_GLYPHS[best];
  }
  return out;
}
