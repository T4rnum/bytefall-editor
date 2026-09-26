import { colorOf } from '../cellBuffer';
import { type Rgba, TRANSPARENT } from '../color';
import { hashNoise } from '../effects';
import { MAX_FALLOFF, MIN_FALLOFF, type SkinBinding, type SkinBone, skin } from '../skin';
import { glyphsIn, glyphsOut, numIn } from './specs';
import { type GlyphPose, type NodeGraph, type NodeImpl, sample } from './types';

/** Больше живых частиц у одного узла не бывает: 200 в секунду по 10 секунд жизни. */
export const MAX_PARTICLES = 2000;
/** Частиц в секунду не больше этого. */
export const MAX_PARTICLE_RATE = 200;

/** Цвет частицы по возрасту `u` от 0 до 1: от `from` к `to`, и к концу жизни она гаснет. */
function ageColor(from: Rgba, to: Rgba, u: number): Rgba {
  return {
    r: from.r + (to.r - from.r) * u,
    g: from.g + (to.g - from.g) * u,
    b: from.b + (to.b - from.b) * u,
    a: (from.a + (to.a - from.a) * u) * (1 - u),
  };
}

/**
 * Частицы без симуляции (DESIGN.md, раздел 4.4): частица номер i рождается в момент i / rate, а
 * всё остальное — из какого символа она вылетела, направление, скорость — берётся из шума по её
 * номеру и зерну. Положение в момент t — формула от возраста, поэтому перемотка в любую точку
 * даёт то же, что проигрывание, и кэш не нужен. Поэтому же частота не ведётся ключами: новая
 * частота передвинула бы рождение всех частиц разом.
 *
 * Рождение идёт и до нуля: в первый момент сцены частицы уже летят. Узел отдаёт только частицы:
 * символы, из которых они вылетели, идут дальше своей веткой, и свечение одной не достаётся
 * другой. Вместе их сводит «Объединить».
 */
export const particlesNode: NodeImpl = {
  spec: {
    kind: 'particles',
    label: 'Частицы',
    category: 'generator',
    hint: 'Символы вылетают из символов на входе, стареют по ряду и гаснут',
    inputs: [
      glyphsIn('glyphs', 'Откуда'),
      numIn('life', 'Жизнь, мс', 1500, 20, 10000),
      numIn('speed', 'Скорость', 4, 0, 128),
      numIn('angle', 'Направление, °', -90, -360, 360),
      numIn('spread', 'Разброс, °', 60, 0, 360),
      numIn('gravity', 'Тяжесть', 1, -128, 128),
    ],
    outputs: [glyphsOut('glyphs', 'Частицы')],
    options: [
      { name: 'glyphs', label: 'Ряд символов', type: 'text', default: '@*+.', maxLength: 64 },
      { name: 'from', label: 'Цвет в начале', type: 'color', default: '#ffec27' },
      { name: 'to', label: 'Цвет в конце', type: 'color', default: '#ff004d' },
      {
        name: 'rate',
        label: 'В секунду',
        type: 'number',
        default: 20,
        min: 0,
        max: MAX_PARTICLE_RATE,
      },
      {
        name: 'seed',
        label: 'Зерно',
        type: 'number',
        default: 1,
        min: 0,
        max: 2147483647,
        integer: true,
      },
    ],
  },
  run: (r) => {
    const sources = r.glyphs('glyphs');
    const glyphs = [...r.option<string>('glyphs')];
    const rate = r.option<number>('rate');
    // Жизнь — одна на узел: у первого символа. Иначе рождение зависело бы от того, откуда.
    const life = sources.length > 0 ? sample(r.num('life'), sources)[0] / 1000 : 0;
    if (sources.length === 0 || glyphs.length === 0 || rate <= 0 || life <= 0)
      return { glyphs: [] };
    const from = colorOf(r.option<string>('from'));
    const to = colorOf(r.option<string>('to'));
    const [speed, angle, spread, gravity] = ['speed', 'angle', 'spread', 'gravity'].map((n) =>
      sample(r.num(n), sources),
    );
    const t = r.ctx.time / 1000;
    // Живые — кто уже родился и ещё не дожил до конца: 0 ≤ возраст < life. Сверх предела — младшие.
    const last = Math.floor(t * rate);
    const first = Math.max(Math.floor((t - life) * rate) + 1, last - MAX_PARTICLES + 1);
    const salt = Math.imul(r.option<number>('seed') | 0, 7919);
    const born: GlyphPose[] = [];
    for (let i = first; i <= last; i++) {
      const noise = (n: number): number => hashNoise(i, n, salt);
      const age = t - i / rate;
      const u = age / life;
      const origin = Math.floor(noise(0) * sources.length);
      const source = sources[origin];
      const direction = ((angle[origin] + (noise(1) - 0.5) * spread[origin]) * Math.PI) / 180;
      const velocity = speed[origin] * (0.5 + noise(2));
      born.push({
        key: source.key,
        particle: i,
        // Символ стареет по ряду: от первого к последнему, как искра, что гаснет.
        glyph: glyphs[Math.min(glyphs.length - 1, Math.floor(u * glyphs.length))],
        x: source.x + Math.cos(direction) * velocity * age,
        y: source.y + Math.sin(direction) * velocity * age + 0.5 * gravity[origin] * age * age,
        rot: 0,
        sx: 1,
        sy: 1,
        fg: ageColor(from, to, u),
        bg: TRANSPARENT,
        material: null,
      });
    }
    return { glyphs: born };
  },
  animated: () => true,
};

export const joinNode: NodeImpl = {
  spec: {
    kind: 'join',
    label: 'Объединить',
    category: 'utility',
    hint: 'Два потока в один: второй рисуется поверх первого',
    inputs: [glyphsIn('a', 'Снизу'), glyphsIn('b', 'Сверху')],
    outputs: [glyphsOut()],
    options: [],
  },
  run: (r) => {
    const a = r.glyphs('a');
    const b = r.glyphs('b');
    for (const p of b) a.push(p);
    return { glyphs: a };
  },
};

/** Привязка узла: один объект на настройки узла — по нему кэшируются веса символов. */
const skinCache = new WeakMap<object, SkinBinding>();

export const bonesNode: NodeImpl = {
  spec: {
    kind: 'bones',
    label: 'Кости',
    category: 'action',
    hint: 'Символы гнутся за костями объекта: мягко у суставов',
    inputs: [glyphsIn()],
    outputs: [glyphsOut()],
    options: [
      { name: 'bones', label: 'Кости', type: 'bones' },
      {
        name: 'falloff',
        label: 'Мягкость',
        type: 'number',
        default: 1.5,
        min: MIN_FALLOFF,
        max: MAX_FALLOFF,
      },
    ],
  },
  run: (r) => {
    const poses = r.glyphs('glyphs');
    let d = skinCache.get(r.node.options);
    if (!d) {
      d = { bones: r.option<readonly SkinBone[]>('bones'), falloff: r.option<number>('falloff') };
      skinCache.set(r.node.options, d);
    }
    skin(poses, d, r.ctx);
    return { glyphs: poses };
  },
  animated: () => true,
};

/** Кости всех узлов «Кости» графа: по ним сцена считает, где кости сейчас. */
export function graphBones(graph: NodeGraph | null): SkinBone[] {
  if (!graph) return [];
  return graph.nodes.flatMap((n) =>
    n.kind === 'bones' ? [...((n.options.bones as readonly SkinBone[] | undefined) ?? [])] : [],
  );
}
