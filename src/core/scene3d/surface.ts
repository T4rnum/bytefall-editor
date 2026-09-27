import type { Primitive3D } from './types';

/**
 * Точки на поверхности тела: где стоят символы в режиме B (DESIGN.md, раздел 6). Примитивы тех
 * же размеров, что у рендера режима A: куб 1×1×1, шар, цилиндр и конус диаметром и высотой 1,
 * тор с радиусами 0,35 и 0,15 в плоскости XY, квадрат 1×1 в плоскости XY лицом к +Z.
 *
 * Уровень детализации задаёт шаг между точками: на нулевом 0,5, каждый следующий в √2 раз
 * мельче. Точки одного уровня всегда те же — кэш по виду и уровню, — поэтому при вращении
 * символы едут вместе с поверхностью, а не перетасовываются.
 */
export interface Surface {
  readonly count: number;
  /** x, y, z на точку в координатах тела. */
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** r, g, b долями на точку, sRGB; null — белый, цвет даёт тело. */
  readonly colors: Float32Array | null;
  /** Замкнутая поверхность: изнанка никогда не видна, и точки спиной к камере можно не считать. */
  readonly closed: boolean;
}

export const MAX_LEVEL = 16;

export const levelSpacing = (level: number): number => 0.5 * Math.pow(2, -level / 2);

/** Самый грубый уровень, у которого шаг не больше `spacing`. */
export function levelFor(spacing: number): number {
  if (!(spacing > 0)) return MAX_LEVEL;
  const level = Math.ceil(-2 * Math.log2(spacing / 0.5) - 1e-9);
  return Math.max(0, Math.min(MAX_LEVEL, level));
}

/** Площадь поверхности примитива: по ней считается, сколько точек даст уровень. */
export const PRIMITIVE_AREA: Readonly<Record<Primitive3D, number>> = {
  box: 6,
  sphere: Math.PI,
  cylinder: Math.PI * 1.5,
  cone: Math.PI * 0.25 + Math.PI * 0.5 * Math.hypot(0.5, 1),
  torus: 4 * Math.PI * Math.PI * 0.35 * 0.15,
  plane: 1,
};

/** Радиус шара вокруг начала координат, в который помещается примитив. */
export const PRIMITIVE_RADIUS: Readonly<Record<Primitive3D, number>> = {
  box: Math.sqrt(3) / 2,
  sphere: 0.5,
  cylinder: Math.SQRT1_2,
  cone: Math.SQRT1_2,
  torus: 0.5,
  plane: Math.SQRT1_2,
};

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Накопитель точек: память растёт удвоением. */
class Points {
  private p = new Float32Array(3 * 256);
  private n = new Float32Array(3 * 256);
  count = 0;

  add(x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    if (this.count * 3 + 3 > this.p.length) {
      const p = new Float32Array(this.p.length * 2);
      const n = new Float32Array(this.n.length * 2);
      p.set(this.p);
      n.set(this.n);
      this.p = p;
      this.n = n;
    }
    this.p.set([x, y, z], this.count * 3);
    this.n.set([nx, ny, nz], this.count * 3);
    this.count++;
  }

  finish(closed: boolean): Surface {
    const size = this.count * 3;
    return {
      count: this.count,
      positions: this.p.slice(0, size),
      normals: this.n.slice(0, size),
      colors: null,
      closed,
    };
  }
}

/** Диск радиуса `r` подсолнухом: точки равномерно по площади. */
function disk(out: Points, r: number, y: number, ny: number, spacing: number): void {
  const count = Math.max(1, Math.round((Math.PI * r * r) / (spacing * spacing)));
  for (let k = 0; k < count; k++) {
    const rho = r * Math.sqrt((k + 0.5) / count);
    const angle = k * GOLDEN;
    out.add(rho * Math.cos(angle), y, rho * Math.sin(angle), 0, ny, 0);
  }
}

/** Точки по сетке `n` × `n` на квадрате 1×1 вокруг нуля. */
const grid = (n: number, fn: (u: number, v: number) => void): void => {
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) fn((i + 0.5) / n - 0.5, (j + 0.5) / n - 0.5);
};

const sides = (spacing: number, length: number, min = 1): number =>
  Math.max(min, Math.round(length / spacing));

const SAMPLERS: Readonly<Record<Primitive3D, (out: Points, spacing: number) => void>> = {
  // Спираль Фибоначчи: точки равномерно по сфере, без полюсов с толпой точек.
  sphere(out, spacing) {
    const count = Math.max(4, Math.round(Math.PI / (spacing * spacing)));
    for (let i = 0; i < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / count;
      const r = Math.sqrt(1 - y * y);
      const angle = i * GOLDEN;
      const x = r * Math.cos(angle);
      const z = r * Math.sin(angle);
      out.add(x * 0.5, y * 0.5, z * 0.5, x, y, z);
    }
  },
  box(out, spacing) {
    const n = sides(spacing, 1);
    for (const s of [-1, 1]) {
      grid(n, (u, v) => out.add(s * 0.5, u, v, s, 0, 0));
      grid(n, (u, v) => out.add(u, s * 0.5, v, 0, s, 0));
      grid(n, (u, v) => out.add(u, v, s * 0.5, 0, 0, s));
    }
  },
  cylinder(out, spacing) {
    const around = sides(spacing, Math.PI, 3);
    const along = sides(spacing, 1);
    for (let j = 0; j < along; j++) {
      const y = (j + 0.5) / along - 0.5;
      for (let i = 0; i < around; i++) {
        const angle = ((i + (j % 2) * 0.5) / around) * 2 * Math.PI;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        out.add(c * 0.5, y, s * 0.5, c, 0, s);
      }
    }
    disk(out, 0.5, 0.5, 1, spacing);
    disk(out, 0.5, -0.5, -1, spacing);
  },
  // Кольца вдоль образующей: точек на кольце столько, сколько влезает в его длину.
  cone(out, spacing) {
    const slant = Math.hypot(0.5, 1);
    const rings = sides(spacing, slant);
    for (let j = 0; j < rings; j++) {
      const t = (j + 0.5) / rings;
      const rho = 0.5 * t;
      const count = sides(spacing, 2 * Math.PI * rho);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * 2 * Math.PI + j * GOLDEN;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        out.add(rho * c, 0.5 - t, rho * s, c / slant, 0.5 / slant, s / slant);
      }
    }
    disk(out, 0.5, -0.5, -1, spacing);
  },
  torus(out, spacing) {
    const big = 0.35;
    const small = 0.15;
    const rings = sides(spacing, 2 * Math.PI * small, 3);
    for (let j = 0; j < rings; j++) {
      const phi = (j / rings) * 2 * Math.PI;
      const count = sides(spacing, 2 * Math.PI * (big + small * Math.cos(phi)), 3);
      for (let i = 0; i < count; i++) {
        const theta = ((i + (j % 2) * 0.5) / count) * 2 * Math.PI;
        const nx = Math.cos(phi) * Math.cos(theta);
        const ny = Math.cos(phi) * Math.sin(theta);
        const nz = Math.sin(phi);
        const ring = big + small * Math.cos(phi);
        out.add(ring * Math.cos(theta), ring * Math.sin(theta), small * nz, nx, ny, nz);
      }
    }
  },
  plane(out, spacing) {
    grid(sides(spacing, 1), (u, v) => out.add(u, v, 0, 0, 0, 1));
  },
};

const cache = new Map<string, Surface>();

/** Точки примитива на уровне детализации. */
export function primitiveSurface(kind: Primitive3D, level: number): Surface {
  const key = `${kind}:${level}`;
  let surface = cache.get(key);
  if (!surface) {
    const out = new Points();
    SAMPLERS[kind](out, levelSpacing(level));
    surface = out.finish(kind !== 'plane');
    cache.set(key, surface);
  }
  return surface;
}
