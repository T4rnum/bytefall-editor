import { colorOf } from '../cellBuffer';
import { type Rgba, TRANSPARENT } from '../color';
import { hashNoise } from '../effects';
import { xOf, yOf } from '../grid';
import { PERIOD_MAX, glyphsIn, glyphsOut, numIn } from './specs';
import { type GlyphPose, type NodeImpl, type OptionSpec, sample } from './types';

/**
 * Генерация, как геоноды Blender: символы по контуру формы, россыпью по её площади и вдоль
 * кривой. Форма — ячейки, где стоят символы потока; рождённые символы — не из ячеек объекта,
 * поэтому у них свой номер, как у частиц.
 */

const TAU = Math.PI * 2;

/** Ячейка в число: форма не ограничена холстом, ключ сетки с его нулём не годится. */
const cellId = (x: number, y: number): number => (y + 32768) * 65536 + (x + 32768);

/** Ячейки формы: где стоят символы потока, частицы не в счёт. */
function shapeCells(poses: readonly GlyphPose[]): Map<number, GlyphPose> {
  const cells = new Map<number, GlyphPose>();
  for (const p of poses) {
    if (p.particle === null) cells.set(cellId(Math.floor(p.x), Math.floor(p.y)), p);
  }
  return cells;
}

/** Рождённый символ в центре ячейки. */
const born = (source: GlyphPose, n: number, x: number, y: number, glyph: string, fg: Rgba) => ({
  key: source.key,
  particle: n,
  glyph,
  x: x + 0.5,
  y: y + 0.5,
  rot: 0,
  sx: 1,
  sy: 1,
  fg,
  bg: TRANSPARENT,
  material: null,
});

const SEED: OptionSpec = {
  name: 'seed',
  label: 'Зерно',
  type: 'number',
  default: 1,
  min: 0,
  max: 2147483647,
  integer: true,
};

export const contourNode: NodeImpl = {
  spec: {
    kind: 'contour',
    label: 'По контуру',
    category: 'generator',
    hint: 'Символы вокруг формы снаружи: рамка, ореол из букв, обводка в ячейках',
    inputs: [glyphsIn('glyphs', 'Форма'), numIn('thickness', 'Толщина', 1, 1, 4, true)],
    outputs: [glyphsOut('glyphs', 'Контур')],
    options: [
      { name: 'glyph', label: 'Символ', type: 'text', default: '+', maxLength: 8 },
      { name: 'color', label: 'Цвет', type: 'color', default: '#ffffff' },
      {
        name: 'corners',
        label: 'Углы',
        type: 'enum',
        default: 'square',
        values: [
          { value: 'square', label: 'прямые' },
          { value: 'round', label: 'срезанные' },
        ],
      },
    ],
  },
  run: (r) => {
    const cells = shapeCells(r.glyphs('glyphs'));
    const glyph = [...r.option<string>('glyph')][0] ?? '';
    const round = r.option<string>('corners') === 'round';
    const fg = colorOf(r.option<string>('color'));
    const thickness = sample(r.num('thickness'), [...cells.values()]);
    const ring = new Map<number, GlyphPose>();
    [...cells.values()].forEach((p, i) => {
      const t = Math.max(1, Math.round(thickness[i]));
      const cx = Math.floor(p.x);
      const cy = Math.floor(p.y);
      for (let dy = -t; dy <= t; dy++) {
        for (let dx = -t; dx <= t; dx++) {
          if (round && Math.abs(dx) + Math.abs(dy) > t) continue;
          const id = cellId(cx + dx, cy + dy);
          if (!cells.has(id) && !ring.has(id))
            ring.set(id, born(p, ring.size, cx + dx, cy + dy, glyph, fg));
        }
      }
    });
    return { glyphs: glyph === '' ? [] : [...ring.values()] };
  },
};

export const scatterNode: NodeImpl = {
  spec: {
    kind: 'scatter',
    label: 'По площади',
    category: 'generator',
    hint: 'Россыпь символов по ячейкам формы или по её рамке: звёзды, пыль, блёстки',
    inputs: [
      glyphsIn('glyphs', 'Форма'),
      numIn('density', 'Плотность', 0.2, 0, 1),
      numIn('period', 'Смена, мс', 0, 0, PERIOD_MAX),
    ],
    outputs: [glyphsOut('glyphs', 'Россыпь')],
    options: [
      { name: 'glyphs', label: 'Символы', type: 'text', default: '.*+', maxLength: 64 },
      { name: 'from', label: 'Цвет 1', type: 'color', default: '#ffffff' },
      { name: 'to', label: 'Цвет 2', type: 'color', default: '#29adff' },
      {
        name: 'area',
        label: 'Где',
        type: 'enum',
        default: 'cells',
        values: [
          { value: 'cells', label: 'в ячейках формы' },
          { value: 'bounds', label: 'в её рамке' },
        ],
      },
      SEED,
    ],
  },
  run: (r) => {
    const cells = shapeCells(r.glyphs('glyphs'));
    const set = [...r.option<string>('glyphs')];
    const first = cells.values().next().value;
    if (!first || set.length === 0) return { glyphs: [] };
    const density = sample(r.num('density'), [first])[0];
    const period = sample(r.num('period'), [first])[0];
    const tick = period > 0 ? Math.floor(r.ctx.time / Math.max(1, period)) : 0;
    const salt = Math.imul(r.option<number>('seed') | 0, 7919) + tick * 5;
    const [from, to] = [colorOf(r.option<string>('from')), colorOf(r.option<string>('to'))];
    const out: GlyphPose[] = [];
    const visit = (x: number, y: number): void => {
      if (hashNoise(x, y, salt) >= density) return;
      const glyph = set[Math.floor(hashNoise(x, y, salt + 1) * set.length)];
      const k = hashNoise(x, y, salt + 2);
      const fg = {
        r: from.r + (to.r - from.r) * k,
        g: from.g + (to.g - from.g) * k,
        b: from.b + (to.b - from.b) * k,
        a: from.a + (to.a - from.a) * k,
      };
      out.push(born(first, out.length, x, y, glyph, fg));
    };
    if (r.option<string>('area') === 'cells') {
      for (const id of cells.keys()) visit((id % 65536) - 32768, Math.floor(id / 65536) - 32768);
    } else {
      const xs = [...cells.values()].map((p) => Math.floor(p.x));
      const ys = [...cells.values()].map((p) => Math.floor(p.y));
      for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
        for (let x = Math.min(...xs); x <= Math.max(...xs); x++) visit(x, y);
      }
    }
    return { glyphs: out };
  },
  animated: (node, linked) => linked('period') || (node.values.period ?? 0) > 0,
};

/** Где на кривой символ, прошедший путь `s` от начала, и куда кривая смотрит там, в радианах. */
function curvePoint(shape: string, s: number, radius: number, start: number) {
  const r = Math.max(0.5, radius);
  if (shape === 'wave') {
    const phase = s / r + start;
    return { x: s, y: r * Math.sin(phase), angle: Math.atan(Math.cos(phase)) };
  }
  // Спираль за оборот отходит от центра ещё на радиус; круг — нет.
  const theta = start + s / r;
  const rr = shape === 'spiral' ? r * (1 + s / r / TAU) : r;
  return { x: rr * Math.cos(theta), y: rr * Math.sin(theta), angle: theta + Math.PI / 2 };
}

export const curveNode: NodeImpl = {
  spec: {
    kind: 'curve',
    label: 'На кривую',
    category: 'action',
    hint: 'Кладёт символы по порядку чтения на круг, волну или спираль: надпись по дуге',
    inputs: [
      glyphsIn(),
      numIn('radius', 'Радиус', 6, 0.5, 512),
      numIn('spacing', 'Шаг', 1, 0.1, 16),
      numIn('angle', 'Начало, °', -90, -360, 360),
    ],
    outputs: [glyphsOut()],
    options: [
      {
        name: 'shape',
        label: 'Кривая',
        type: 'enum',
        default: 'circle',
        values: [
          { value: 'circle', label: 'круг' },
          { value: 'wave', label: 'волна' },
          { value: 'spiral', label: 'спираль' },
        ],
      },
      {
        name: 'orient',
        label: 'Символы',
        type: 'enum',
        default: 'tangent',
        values: [
          { value: 'tangent', label: 'вдоль кривой' },
          { value: 'upright', label: 'прямо' },
        ],
      },
    ],
  },
  run: (r) => {
    const poses = r.glyphs('glyphs');
    const shape = r.option<string>('shape');
    const tangent = r.option<string>('orient') === 'tangent';
    const [radius, spacing, angle] = ['radius', 'spacing', 'angle'].map((n) =>
      sample(r.num(n), poses),
    );
    // Порядок чтения — по исходным ячейкам: строка за строкой, слева направо.
    const order = poses
      .map((_, i) => i)
      .sort((a, b) => {
        const pa = poses[a];
        const pb = poses[b];
        return (
          yOf(pa.key) - yOf(pb.key) ||
          xOf(pa.key) - xOf(pb.key) ||
          (pa.particle ?? -1) - (pb.particle ?? -1)
        );
      });
    const { x: cx, y: cy } = r.ctx.center;
    // Кривая строится на экране: шаг — ширина ячейки, радиус — в высотах ячейки.
    const aspect = r.ctx.aspect ?? 1;
    order.forEach((i, n) => {
      const p = poses[i];
      const step = n * spacing[i] * aspect;
      const at = curvePoint(shape, step, radius[i], (angle[i] * Math.PI) / 180);
      p.x = cx + at.x / aspect;
      p.y = cy + at.y;
      if (tangent) p.rot += (at.angle * 180) / Math.PI;
    });
    return { glyphs: poses };
  },
};
