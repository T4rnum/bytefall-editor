import {
  type GlyphMaterial,
  MAX_GLOW_RADIUS,
  MAX_GLOW_STRENGTH,
  MAX_OUTLINE_WIDTH,
  MAX_PIXEL_SIZE,
  MAX_SHINE_SPEED,
  withMaterialPart,
} from '../material';
import { glyphsIn, glyphsOut, numIn } from './specs';
import { type GlyphPose, type NodeImpl, type NodeRun, sample } from './types';

/**
 * Материал — вид символа на GPU (`render/instanceShader.ts`): контур, свечение, блик, дизеринг.
 * В графе он лежит на каждом символе, а не на объекте: символы, что прошли узел свечения,
 * светятся, а частицы, что шли своей веткой, — нет.
 */

type Part = Partial<GlyphMaterial>;

/**
 * Кладёт часть материала на символы потока. Одинаковая часть — общий объект материала на все
 * символы с одинаковым прежним материалом: так поток не плодит копий, а кэш чисел материала в
 * потоке символов работает по ссылке.
 */
function applyPart(
  r: NodeRun,
  names: readonly string[],
  make: (values: readonly number[]) => Part,
): { glyphs: GlyphPose[] } {
  const poses = r.glyphs('glyphs');
  const sources = names.map((n) => r.num(n));
  const shared = sources.every((s) => typeof s === 'number');
  const constant = shared ? make(sources) : null;
  if (constant) {
    // Соседние символы почти всегда с одним прежним материалом: общий новый — раз на серию.
    const cache = new Map<GlyphMaterial | null, GlyphMaterial | null>();
    let prev: GlyphMaterial | null | undefined;
    let next: GlyphMaterial | null = null;
    for (const p of poses) {
      if (p.material !== prev) {
        prev = p.material;
        next = cache.get(prev) ?? withMaterialPart(prev, constant);
        cache.set(prev, next);
      }
      p.material = next;
    }
    return { glyphs: poses };
  }
  const columns = sources.map((s) => sample(s, poses));
  for (let i = 0; i < poses.length; i++) {
    poses[i].material = withMaterialPart(poses[i].material, make(columns.map((c) => c[i])));
  }
  return { glyphs: poses };
}

export const outlineNode: NodeImpl = {
  spec: {
    kind: 'outline',
    label: 'Контур',
    category: 'material',
    hint: 'Обводит форму символа цветом снаружи',
    inputs: [glyphsIn(), numIn('width', 'Толщина', 1, 1, MAX_OUTLINE_WIDTH, true)],
    outputs: [glyphsOut()],
    options: [{ name: 'color', label: 'Цвет', type: 'color', default: '#000000' }],
  },
  run: (r) => {
    const color = r.option<string>('color');
    return applyPart(r, ['width'], ([width]) => ({
      outline: { color, width: Math.round(Math.min(MAX_OUTLINE_WIDTH, Math.max(1, width))) },
    }));
  },
};

export const glowNode: NodeImpl = {
  spec: {
    kind: 'glow',
    label: 'Свечение',
    category: 'material',
    hint: 'Мягкий ореол по форме символа',
    inputs: [
      glyphsIn(),
      numIn('radius', 'Радиус', 0.5, 0.05, MAX_GLOW_RADIUS),
      numIn('strength', 'Сила', 1.5, 0, MAX_GLOW_STRENGTH),
    ],
    outputs: [glyphsOut()],
    options: [
      { name: 'color', label: 'Цвет', type: 'color', default: '#ffec27' },
      {
        name: 'pattern',
        label: 'Узор',
        type: 'enum',
        default: 'shape',
        values: [
          { value: 'shape', label: 'по форме символа' },
          { value: 'soft', label: 'мягким пятном' },
        ],
      },
    ],
  },
  run: (r) => {
    const color = r.option<string>('color');
    const soft = r.option<string>('pattern') === 'soft';
    return applyPart(r, ['radius', 'strength'], ([radius, strength]) => ({
      glow: soft ? { color, radius, strength, soft } : { color, radius, strength },
    }));
  },
};

export const shineNode: NodeImpl = {
  spec: {
    kind: 'shine',
    label: 'Блик',
    category: 'material',
    hint: 'Светлые полосы бегут по символам под углом, как отражение на стекле',
    inputs: [
      glyphsIn(),
      numIn('width', 'Ширина', 1, 0.1, 64),
      numIn('spacing', 'Шаг', 12, 0.5, 256),
      numIn('speed', 'Скорость', 8, -MAX_SHINE_SPEED, MAX_SHINE_SPEED),
      numIn('angle', 'Угол, °', 30, -360, 360),
    ],
    outputs: [glyphsOut()],
    options: [{ name: 'color', label: 'Цвет', type: 'color', default: '#ffffff' }],
  },
  run: (r) => {
    const color = r.option<string>('color');
    const names = ['width', 'spacing', 'speed', 'angle'];
    return applyPart(r, names, ([width, spacing, speed, angle]) => ({
      shine: { color, width, spacing, speed, angle },
    }));
  },
  animated: (node, linked) => linked('speed') || (node.values.speed ?? 8) !== 0,
};

export const ditherNode: NodeImpl = {
  spec: {
    kind: 'dither',
    label: 'Дизеринг',
    category: 'material',
    hint: 'Символ проступает узором Байера: часть пикселей шрифта пропадает',
    inputs: [glyphsIn(), numIn('amount', 'Сколько пропадает', 0.5, 0, 1)],
    outputs: [glyphsOut()],
    options: [],
  },
  run: (r) => applyPart(r, ['amount'], ([amount]) => ({ dither: { amount } })),
};

/** Строки развёртки на самом символе: постобработка кинескопа, но только для этого объекта. */
export const scanlinesNode: NodeImpl = {
  spec: {
    kind: 'scanlines',
    label: 'Развёртка',
    category: 'material',
    hint: 'Каждая вторая строка пикселей символа темнее, как на кинескопе',
    inputs: [glyphsIn(), numIn('amount', 'Насколько темнее', 0.5, 0, 1)],
    outputs: [glyphsOut()],
    options: [],
  },
  run: (r) => applyPart(r, ['amount'], ([amount]) => ({ scanlines: { amount } })),
};

/**
 * Крупные пиксели: символ рисуется блоками в несколько пикселей шрифта. Вместе с дизерингом из
 * него собирается распад: блоки крупнеют, а узор съедает их.
 */
export const pixelsNode: NodeImpl = {
  spec: {
    kind: 'pixels',
    label: 'Пиксели',
    category: 'material',
    hint: 'Символ блоками в несколько пикселей шрифта: 1 — как есть, 8 — одна плашка на ячейку',
    inputs: [glyphsIn(), numIn('size', 'Сторона блока', 2, 1, MAX_PIXEL_SIZE, true)],
    outputs: [glyphsOut()],
    options: [],
  },
  run: (r) =>
    applyPart(r, ['size'], ([size]) => ({
      pixels: { size: Math.round(Math.min(MAX_PIXEL_SIZE, Math.max(1, size))) },
    })),
};
