import { type Point, rectFromPoints } from './geometry';

/** Отрезок по Брезенхэму, включая обе концевые точки. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

export function rectPoints(a: Point, b: Point, filled: boolean): Point[] {
  const r = rectFromPoints(a, b);
  const points: Point[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const onEdge = x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1;
      if (filled || onEdge) points.push({ x, y });
    }
  }
  return points;
}

/**
 * Эллипс, вписанный в прямоугольник между a и b. Ячейка считается внутренней,
 * если её центр попадает в эллипс с радиусами, уменьшенными на четверть ячейки:
 * так маленькие размеры выглядят ожидаемо (3×3 даёт "плюс", 2×2 даёт квадрат).
 */
export function ellipsePoints(a: Point, b: Point, filled: boolean): Point[] {
  const r = rectFromPoints(a, b);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rx = r.w / 2 - 0.25;
  const ry = r.h / 2 - 0.25;
  const inside = (x: number, y: number): boolean => {
    const nx = (x + 0.5 - cx) / rx;
    const ny = (y + 0.5 - cy) / ry;
    return nx * nx + ny * ny <= 1;
  };
  const points: Point[] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!inside(x, y)) continue;
      const onEdge =
        !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (filled || onEdge) points.push({ x, y });
    }
  }
  return points;
}
