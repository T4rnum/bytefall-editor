import { type Point, inBounds } from './geometry';
import { linePoints } from './shapes';

/**
 * Ячейки внутри замкнутого многоугольника по правилу чётности.
 *
 * Считается по центрам ячеек: ячейка (x, y) внутри, если луч из точки (x + 0.5, y + 0.5) вправо
 * пересекает нечётное число рёбер. Это даёт ровно тот же результат при любом порядке обхода
 * вершин и при самопересечениях — лассо рисуют от руки, и петли в нём обычное дело.
 *
 * Контур добавляется отдельно: ячейки, через которые ребро прошло вскользь, центром внутрь не
 * попадают, но пользователь их обвёл и ждёт, что они выделены.
 */
export function polygonCells(points: readonly Point[], width: number, height: number): Point[] {
  if (points.length === 0) return [];
  const seen = new Set<number>();
  const result: Point[] = [];
  const add = (x: number, y: number): void => {
    if (!inBounds(x, y, width, height)) return;
    const key = y * width + x;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ x, y });
  };

  for (const p of outlineCells(points)) add(p.x, p.y);

  if (points.length >= 3) {
    // Спред в Math.min на длинном контуре переполняет стек, поэтому границы ищутся циклом.
    let top = points[0].y;
    let bottom = points[0].y;
    for (const p of points) {
      if (p.y < top) top = p.y;
      if (p.y > bottom) bottom = p.y;
    }
    top = Math.max(0, top);
    bottom = Math.min(height - 1, bottom);
    for (let y = top; y <= bottom; y++) {
      for (const [from, to] of spansAt(points, y + 0.5)) {
        const x0 = Math.max(0, Math.ceil(from - 0.5));
        const x1 = Math.min(width - 1, Math.floor(to - 0.5));
        for (let x = x0; x <= x1; x++) add(x, y);
      }
    }
  }
  return result;
}

/** Ячейки под ломаной, включая замыкающее ребро. */
function* outlineCells(points: readonly Point[]): Generator<Point> {
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    yield* linePoints(a.x, a.y, b.x, b.y);
  }
}

/**
 * Горизонтальные отрезки внутри многоугольника на высоте `y`. Рёбра берутся полуоткрытыми
 * (верхний конец включён, нижний нет), иначе вершина, попавшая ровно на луч, считалась бы дважды
 * и строка выворачивалась бы наизнанку.
 */
function spansAt(points: readonly Point[], y: number): [number, number][] {
  const crossings: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const ay = a.y + 0.5;
    const by = b.y + 0.5;
    if (ay === by) continue;
    if (y < Math.min(ay, by) || y >= Math.max(ay, by)) continue;
    const t = (y - ay) / (by - ay);
    crossings.push(a.x + 0.5 + t * (b.x - a.x));
  }
  crossings.sort((p, q) => p - q);
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) spans.push([crossings[i], crossings[i + 1]]);
  return spans;
}
