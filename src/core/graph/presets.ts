import type { Deformer } from '../deformers';
import type { GlyphMaterial } from '../material';
import type { GraphLink, GraphNode, OptionValue } from './types';

/**
 * Сборки: готовые цепочки узлов на место бывших деформеров и частей материала. Из них строятся
 * миграция стеков версии 9 и меню «Добавить» — «Волна» это синус, поданный на сдвиг, а не
 * отдельный узел. Идентификаторы узлов — от идентификатора деформера: у одного объекта в разных
 * кадрах они совпадают, и ключи анимации находят свой вход.
 */

/** Кусок графа, который встаёт в поток: поток входит в `entry`, выходит из `exit`. */
export interface Fragment {
  readonly nodes: readonly GraphNode[];
  readonly links: readonly GraphLink[];
  readonly entry: readonly { readonly node: string; readonly input: string }[];
  readonly exit: { readonly node: string; readonly out: string };
  /** Параметр деформера → вход узла: так ключи старого деформера находят новое место. */
  readonly params: Readonly<Record<string, { readonly node: string; readonly input: string }>>;
  /** Сколько столбцов редактора занимает сборка. */
  readonly columns: number;
}

/** Шаг сетки редактора узлов: столбец и строка. */
export const COLUMN = 220;
export const ROW = 160;

function node(
  id: string,
  kind: string,
  col: number,
  row: number,
  values: Record<string, number> = {},
  options: Record<string, OptionValue> = {},
  muted = false,
): GraphNode {
  return { id, kind, muted, x: col * COLUMN, y: row * ROW, values, options };
}

const link = (from: string, out: string, to: string, input: string): GraphLink => ({
  from,
  out,
  to,
  in: input,
});

/** Сборка из одного действия: поток входит и выходит через его «Символы». */
function single(action: GraphNode, extra: Partial<Fragment> = {}): Fragment {
  return {
    nodes: [action],
    links: [],
    entry: [{ node: action.id, input: 'glyphs' }],
    exit: { node: action.id, out: 'glyphs' },
    params: {},
    columns: 1,
    ...extra,
  };
}

/** Деформер стека версии 9 — сборкой узлов с теми же числами. */
export function fragmentOfDeformer(d: Deformer): Fragment {
  const b = d.id;
  const off = !d.enabled;
  const p = (nodeId: string, input: string) => ({ node: `${b}~${nodeId}`, input });
  switch (d.kind) {
    case 'wave': {
      // Ось смещения — `axis`, волна бежит поперёк: вдоль X смещает по Y и наоборот.
      const along = d.axis === 'y' ? 'x' : 'y';
      return {
        nodes: [
          node(`${b}~pos`, 'position', 0, 1),
          node(`${b}~wave`, 'wave', 1, 1, { wavelength: d.wavelength, period: d.period }),
          node(`${b}~offset`, 'offset', 2, 0, { strength: d.amplitude }, {}, off),
        ],
        links: [
          link(`${b}~pos`, along, `${b}~wave`, 'value'),
          link(`${b}~wave`, 'value', `${b}~offset`, d.axis),
        ],
        entry: [{ node: `${b}~offset`, input: 'glyphs' }],
        exit: { node: `${b}~offset`, out: 'glyphs' },
        params: {
          amplitude: p('offset', 'strength'),
          wavelength: p('wave', 'wavelength'),
          period: p('wave', 'period'),
        },
        columns: 3,
      };
    }
    case 'jitter':
      return {
        nodes: [
          node(`${b}~noise`, 'noise', 0, 1, { period: d.period }, { seed: d.seed }),
          node(`${b}~offset`, 'offset', 1, 0, { strength: d.amplitude }, {}, off),
          node(`${b}~rotate`, 'rotate', 2, 0, { strength: d.angle }, { pivot: 'glyph' }, off),
        ],
        links: [
          link(`${b}~noise`, 'x', `${b}~offset`, 'x'),
          link(`${b}~noise`, 'y', `${b}~offset`, 'y'),
          link(`${b}~offset`, 'glyphs', `${b}~rotate`, 'glyphs'),
          link(`${b}~noise`, 'z', `${b}~rotate`, 'angle'),
        ],
        entry: [{ node: `${b}~offset`, input: 'glyphs' }],
        exit: { node: `${b}~rotate`, out: 'glyphs' },
        params: {
          amplitude: p('offset', 'strength'),
          angle: p('rotate', 'strength'),
          period: p('noise', 'period'),
        },
        columns: 3,
      };
    case 'twist':
      return {
        nodes: [
          node(`${b}~dist`, 'distance', 0, 1),
          node(`${b}~rotate`, 'rotate', 1, 0, { strength: d.strength }, { pivot: 'center' }, off),
        ],
        links: [link(`${b}~dist`, 'value', `${b}~rotate`, 'angle')],
        entry: [{ node: `${b}~rotate`, input: 'glyphs' }],
        exit: { node: `${b}~rotate`, out: 'glyphs' },
        params: { strength: p('rotate', 'strength') },
        columns: 2,
      };
    case 'scaleFalloff':
      return {
        nodes: [
          node(`${b}~dist`, 'distance', 0, 1),
          node(`${b}~range`, 'mapRange', 1, 1, {
            fromMin: 0,
            fromMax: d.radius,
            toMin: d.inner,
            toMax: d.outer,
          }),
          node(`${b}~scale`, 'scale', 2, 0, {}, {}, off),
        ],
        links: [
          link(`${b}~dist`, 'value', `${b}~range`, 'value'),
          link(`${b}~range`, 'value', `${b}~scale`, 'factor'),
        ],
        entry: [{ node: `${b}~scale`, input: 'glyphs' }],
        exit: { node: `${b}~scale`, out: 'glyphs' },
        params: {
          radius: p('range', 'fromMax'),
          inner: p('range', 'toMin'),
          outer: p('range', 'toMax'),
        },
        columns: 3,
      };
    case 'colorRamp':
      return {
        nodes: [
          node(
            `${b}~grad`,
            'gradient',
            0,
            1,
            { length: d.length, period: d.period },
            { axis: d.axis },
          ),
          node(`${b}~color`, 'color', 1, 0, { amount: d.amount }, { from: d.from, to: d.to }, off),
        ],
        links: [link(`${b}~grad`, 'value', `${b}~color`, 'factor')],
        entry: [{ node: `${b}~color`, input: 'glyphs' }],
        exit: { node: `${b}~color`, out: 'glyphs' },
        params: {
          length: p('grad', 'length'),
          period: p('grad', 'period'),
          amount: p('color', 'amount'),
        },
        columns: 2,
      };
    case 'bend':
      return single(node(`${b}~bend`, 'bend', 0, 0, { strength: d.strength }, {}, off), {
        params: { strength: p('bend', 'strength') },
      });
    case 'explode':
      return explodeFragment(d, b, off);
    case 'glyphRamp':
      return {
        nodes: [
          node(`${b}~light`, 'brightness', 0, 1),
          node(`${b}~glyph`, 'glyph', 1, 0, {}, { ramp: d.glyphs }, off),
        ],
        links: [link(`${b}~light`, 'value', `${b}~glyph`, 'factor')],
        entry: [{ node: `${b}~glyph`, input: 'glyphs' }],
        exit: { node: `${b}~glyph`, out: 'glyphs' },
        params: {},
        columns: 2,
      };
    case 'particles':
      return particlesFragment(d, b, off);
    case 'skin':
      return single(
        node(`${b}~bones`, 'bones', 0, 0, {}, { bones: d.bones, falloff: d.falloff }, off),
      );
  }
}

/** Разлёт: символы расходятся от центра на долю расстояния и доворачиваются по шуму. */
function explodeFragment(
  d: Extract<Deformer, { kind: 'explode' }>,
  b: string,
  off: boolean,
): Fragment {
  return {
    nodes: [
      node(`${b}~amount`, 'value', 0, 2, { value: d.amount }),
      node(`${b}~pos`, 'position', 0, 1, {}, { origin: 'center' }),
      node(`${b}~noise`, 'noise', 1, 2, { period: 0 }, { seed: d.seed }),
      node(`${b}~mul`, 'math', 2, 2, {}, { op: 'multiply' }),
      node(`${b}~offset`, 'offset', 1, 0, {}, {}, off),
      node(`${b}~rotate`, 'rotate', 3, 0, { strength: d.angle }, { pivot: 'glyph' }, off),
    ],
    links: [
      link(`${b}~pos`, 'x', `${b}~offset`, 'x'),
      link(`${b}~pos`, 'y', `${b}~offset`, 'y'),
      link(`${b}~amount`, 'value', `${b}~offset`, 'strength'),
      link(`${b}~noise`, 'x', `${b}~mul`, 'a'),
      link(`${b}~amount`, 'value', `${b}~mul`, 'b'),
      link(`${b}~offset`, 'glyphs', `${b}~rotate`, 'glyphs'),
      link(`${b}~mul`, 'value', `${b}~rotate`, 'angle'),
    ],
    entry: [{ node: `${b}~offset`, input: 'glyphs' }],
    exit: { node: `${b}~rotate`, out: 'glyphs' },
    params: {
      amount: { node: `${b}~amount`, input: 'value' },
      angle: { node: `${b}~rotate`, input: 'strength' },
    },
    columns: 4,
  };
}

/**
 * Частицы: в стеке они вставали в начало потока, и всё дальше по стеку двигало и их. Сборка
 * повторяет это: частицы и символы сводит «Объединить», частицы снизу.
 */
function particlesFragment(
  d: Extract<Deformer, { kind: 'particles' }>,
  b: string,
  off: boolean,
): Fragment {
  const { life, speed, angle, spread, gravity } = d;
  return {
    nodes: [
      node(
        `${b}~particles`,
        'particles',
        0,
        1,
        { life, speed, angle, spread, gravity },
        { glyphs: d.glyphs, from: d.from, to: d.to, rate: d.rate, seed: d.seed },
        off,
      ),
      node(`${b}~join`, 'join', 1, 0),
    ],
    links: [link(`${b}~particles`, 'glyphs', `${b}~join`, 'a')],
    entry: [
      { node: `${b}~particles`, input: 'glyphs' },
      { node: `${b}~join`, input: 'b' },
    ],
    exit: { node: `${b}~join`, out: 'glyphs' },
    params: Object.fromEntries(
      ['life', 'speed', 'angle', 'spread', 'gravity'].map((k) => [
        k,
        { node: `${b}~particles`, input: k },
      ]),
    ),
    columns: 2,
  };
}

/** Материал объекта версии 8–9 — узлами в конце потока: контур, свечение, блик, дизеринг. */
export function fragmentsOfMaterial(objectId: string, m: GlyphMaterial): Fragment[] {
  const out: Fragment[] = [];
  const b = objectId;
  if (m.outline) {
    const { color, width } = m.outline;
    out.push(single(node(`${b}~outline`, 'outline', 0, 0, { width }, { color })));
  }
  if (m.glow) {
    const { color, radius, strength } = m.glow;
    out.push(single(node(`${b}~glow`, 'glow', 0, 0, { radius, strength }, { color })));
  }
  if (m.shine) {
    const { color, width, spacing, speed, angle } = m.shine;
    out.push(
      single(node(`${b}~shine`, 'shine', 0, 0, { width, spacing, speed, angle }, { color })),
    );
  }
  if (m.dither) {
    out.push(single(node(`${b}~dither`, 'dither', 0, 0, { amount: m.dither.amount })));
  }
  return out;
}
