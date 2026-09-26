import { COLUMN, type Fragment, link, node } from './presets';
import type { GraphLink, GraphNode } from './types';

/**
 * Эффекты на объекте — сборки из узлов словаря, а не отдельные узлы: пульс — синус на «Свет»,
 * мерцание — шум на непрозрачность, аура — шум на силу свечения. Сборку раздают всем выбранным
 * объектам разом; разобрать и пересобрать её можно в редакторе узлов.
 */
export type EffectPresetKind =
  'fire' | 'pulse' | 'flicker' | 'cycle' | 'aura' | 'vignette' | 'dissolve' | 'disintegrate';

/**
 * Зерно сборки от идентификатора её узлов: у каждого объекта, получившего сборку, огонь и шум
 * свои, и пять одинаковых факелов не горят в такт. Для файла зерно — обычная настройка узла.
 */
function seedOf(base: string): number {
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) h = Math.imul(h ^ base.charCodeAt(i), 16777619);
  return (h >>> 0) % 1000000;
}

/** Цепочка «поле → действие»: поток входит в действие и выходит из него. */
function chain(
  nodes: readonly GraphNode[],
  links: readonly GraphLink[],
  action: GraphNode,
): Fragment {
  return {
    nodes: [...nodes, action],
    links,
    entry: [{ node: action.id, input: 'glyphs' }],
    exit: { node: action.id, out: 'glyphs' },
    params: {},
    // Действие стоит последним столбцом сборки.
    columns: action.x / COLUMN + 1,
  };
}

const range = (
  id: string,
  col: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number,
) => node(id, 'mapRange', col, 1, { fromMin, fromMax, toMin, toMax }, { clamp: 'clamp' });

const FRAGMENTS: Readonly<Record<EffectPresetKind, (b: string) => Fragment>> = {
  // Пламя под объектом, объект поверх: язык не закрывает символ, из которого вырос.
  fire: (b) => ({
    nodes: [
      node(`${b}~fire`, 'fire', 0, 1, {}, { seed: seedOf(b) }),
      node(`${b}~join`, 'join', 1, 0),
    ],
    links: [link(`${b}~fire`, 'glyphs', `${b}~join`, 'a')],
    entry: [
      { node: `${b}~fire`, input: 'glyphs' },
      { node: `${b}~join`, input: 'b' },
    ],
    exit: { node: `${b}~join`, out: 'glyphs' },
    params: {},
    columns: 2,
  }),
  pulse: (b) =>
    chain(
      [
        node(`${b}~pos`, 'position', 0, 1),
        node(`${b}~wave`, 'wave', 1, 1, { wavelength: 16, period: 1200 }),
        range(`${b}~range`, 2, -1, 1, 0.5, 1.5),
      ],
      [
        link(`${b}~pos`, 'x', `${b}~wave`, 'value'),
        link(`${b}~wave`, 'value', `${b}~range`, 'value'),
        link(`${b}~range`, 'value', `${b}~light`, 'brightness'),
      ],
      node(`${b}~light`, 'light', 3, 0),
    ),
  // Шум ниже порога гасит символ на такт: порог — доля погасших.
  flicker: (b) =>
    chain(
      [
        node(`${b}~noise`, 'noise', 0, 1, { period: 120 }, { seed: seedOf(b) }),
        range(`${b}~range`, 1, -0.72, -0.7, 0, 1),
      ],
      [
        link(`${b}~noise`, 'x', `${b}~range`, 'value'),
        link(`${b}~range`, 'value', `${b}~light`, 'opacity'),
      ],
      node(`${b}~light`, 'light', 2, 0),
    ),
  // Восемь шагов в секунду по ряду из четырёх символов: множитель — шаги на длину ряда.
  cycle: (b) =>
    chain(
      [
        node(`${b}~time`, 'time', 0, 1),
        node(`${b}~rate`, 'math', 1, 1, { b: 2 }, { op: 'multiply' }),
      ],
      [
        link(`${b}~time`, 'seconds', `${b}~rate`, 'a'),
        link(`${b}~rate`, 'value', `${b}~glyph`, 'factor'),
      ],
      node(`${b}~glyph`, 'glyph', 2, 0, {}, { ramp: '|/-\\', overflow: 'repeat' }),
    ),
  aura: (b) =>
    chain(
      [
        node(
          `${b}~noise`,
          'noise',
          0,
          1,
          { period: 800, scale: 3 },
          { motion: 'flow', seed: seedOf(b) },
        ),
        range(`${b}~range`, 1, -1, 1, 0.5, 2.5),
      ],
      [
        link(`${b}~noise`, 'x', `${b}~range`, 'value'),
        link(`${b}~range`, 'value', `${b}~glow`, 'strength'),
      ],
      node(`${b}~glow`, 'glow', 2, 0, { radius: 1 }, { color: '#83769c', pattern: 'soft' }),
    ),
  vignette: (b) =>
    chain(
      [node(`${b}~dist`, 'distance', 0, 1), range(`${b}~range`, 1, 0, 8, 1, 0.25)],
      [
        link(`${b}~dist`, 'value', `${b}~range`, 'value'),
        link(`${b}~range`, 'value', `${b}~light`, 'brightness'),
      ],
      node(`${b}~light`, 'light', 2, 0),
    ),
  // За две секунды от начала сцены объект уходит в узор Байера целиком.
  dissolve: (b) =>
    chain(
      [node(`${b}~time`, 'time', 0, 1), range(`${b}~range`, 1, 0, 2, 0, 1)],
      [
        link(`${b}~time`, 'seconds', `${b}~range`, 'value'),
        link(`${b}~range`, 'value', `${b}~dither`, 'amount'),
      ],
      node(`${b}~dither`, 'dither', 2, 0),
    ),
  disintegrate,
};

/**
 * Распад: за две секунды символы разлетаются каждый по своему шуму, крупнеют до блоков в шесть
 * пикселей шрифта и тают узором Байера. Время одно на объект, поэтому материал общий у всех.
 */
function disintegrate(b: string): Fragment {
  return {
    nodes: [
      node(`${b}~time`, 'time', 0, 1),
      range(`${b}~spread`, 1, 0, 2, 0, 3),
      node(`${b}~noise`, 'noise', 1, 2, { period: 0 }, { seed: seedOf(b) }),
      range(`${b}~size`, 2, 0, 2, 1, 6),
      range(`${b}~fade`, 3, 0, 2, 0, 1),
      node(`${b}~offset`, 'offset', 2, 0),
      node(`${b}~pixels`, 'pixels', 3, 0),
      node(`${b}~dither`, 'dither', 4, 0),
    ],
    links: [
      link(`${b}~time`, 'seconds', `${b}~spread`, 'value'),
      link(`${b}~time`, 'seconds', `${b}~size`, 'value'),
      link(`${b}~time`, 'seconds', `${b}~fade`, 'value'),
      link(`${b}~noise`, 'x', `${b}~offset`, 'x'),
      link(`${b}~noise`, 'y', `${b}~offset`, 'y'),
      link(`${b}~spread`, 'value', `${b}~offset`, 'strength'),
      link(`${b}~offset`, 'glyphs', `${b}~pixels`, 'glyphs'),
      link(`${b}~size`, 'value', `${b}~pixels`, 'size'),
      link(`${b}~pixels`, 'glyphs', `${b}~dither`, 'glyphs'),
      link(`${b}~fade`, 'value', `${b}~dither`, 'amount'),
    ],
    entry: [{ node: `${b}~offset`, input: 'glyphs' }],
    exit: { node: `${b}~dither`, out: 'glyphs' },
    params: {},
    columns: 5,
  };
}

/** Сборка эффекта с узлами под идентификаторами от `base`. */
export const effectFragment = (kind: EffectPresetKind, base: string): Fragment =>
  FRAGMENTS[kind](base);
