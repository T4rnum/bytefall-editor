import { hashNoise } from '../effects';
import { xOf, yOf } from '../grid';
import { FREE, LENGTH_MAX, LENGTH_MIN, PERIOD_MAX, lift, numIn, numOut } from './specs';
import { type Field, type GlyphPose, type NodeImpl, sample } from './types';

/**
 * Узоры: поля, которые рисуют по символам волну, шум или градиент и бегут со временем. Постоянные
 * входы считаются раз на кадр, а не на символ: узоры стоят почти на каждом объекте с движением.
 */

const TAU = Math.PI * 2;

export const waveNode: NodeImpl = {
  spec: {
    kind: 'wave',
    label: 'Синус',
    category: 'field',
    hint: 'Волна от −1 до 1 вдоль числа на входе, бежит со временем',
    inputs: [
      numIn('value', 'Вдоль', 0, -FREE, FREE),
      numIn('wavelength', 'Длина волны', 8, LENGTH_MIN, LENGTH_MAX),
      numIn('period', 'Период, мс', 1000, 0, PERIOD_MAX),
      numIn('phase', 'Сдвиг, °', 0, -360, 360),
    ],
    outputs: [numOut('value', 'Волна')],
    options: [],
  },
  run: (r) => {
    const { time } = r.ctx;
    const wave = (v: number, wavelength: number, period: number, phase: number) => {
      const shift = period > 0 ? (TAU * time) / Math.max(1, period) : 0;
      return Math.sin((TAU * v) / Math.max(0.01, wavelength) - shift + (phase * Math.PI) / 180);
    };
    const [value, wavelength, period, phase] = ['value', 'wavelength', 'period', 'phase'].map((n) =>
      r.num(n),
    );
    if (typeof value === 'number' || typeof wavelength !== 'number') {
      return { value: lift(wave, value, wavelength, period, phase) };
    }
    // Частый случай — поле вдоль и постоянная волна: свой цикл, без вызова на символ.
    const k = TAU / Math.max(0.01, wavelength);
    const field: Field = (poses) => {
      const along = value(poses);
      const periods = sample(period, poses);
      const phases = sample(phase, poses);
      const out = new Float64Array(poses.length);
      for (let i = 0; i < out.length; i++) {
        const per = periods[i];
        const s = per > 0 ? (TAU * time) / Math.max(1, per) : 0;
        out[i] = Math.sin(k * along[i] - s + (phases[i] * Math.PI) / 180);
      }
      return out;
    };
    return { value: field };
  },
  animated: (node, linked) => linked('period') || (node.values.period ?? 1000) > 0,
};

/** Плавная ступень 0..1: у шума по площади и во времени нет изломов на узлах решётки. */
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Шум по площади: хэш в узлах решётки, между ними — плавная смесь соседей. */
function latticeNoise(x: number, y: number, t: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const top = hashNoise(x0, y0, t) + (hashNoise(x0 + 1, y0, t) - hashNoise(x0, y0, t)) * fx;
  const bottom =
    hashNoise(x0, y0 + 1, t) + (hashNoise(x0 + 1, y0 + 1, t) - hashNoise(x0, y0 + 1, t)) * fx;
  return top + (bottom - top) * fy;
}

/**
 * Шум символа по его исходной ячейке, куда бы его ни унесло раньше по графу: при масштабе 1 —
 * свой у каждой ячейки, крупнее — пятнами в столько ячеек. Частица берёт свой номер, иначе все
 * искры одной ячейки дрожали бы как одна; строки −1 у ячеек не бывает.
 */
function poseNoise(p: GlyphPose, t: number, scale: number): number {
  if (p.particle !== null) return hashNoise(p.particle, -1, t);
  if (scale <= 1) return hashNoise(xOf(p.key), yOf(p.key), t);
  return latticeNoise(xOf(p.key) / scale, yOf(p.key) / scale, t);
}

export const noiseNode: NodeImpl = {
  spec: {
    kind: 'noise',
    label: 'Шум',
    category: 'field',
    hint: 'Случайное число от −1 до 1 у каждого символа, три независимых; меняется раз в период',
    inputs: [
      numIn('period', 'Период, мс', 100, 0, PERIOD_MAX),
      numIn('scale', 'Масштаб', 1, 1, 256),
    ],
    outputs: [numOut('x', 'X'), numOut('y', 'Y'), numOut('z', 'Z')],
    options: [
      {
        name: 'seed',
        label: 'Зерно',
        type: 'number',
        default: 1,
        min: 0,
        max: 2147483647,
        integer: true,
      },
      {
        name: 'motion',
        label: 'Смена',
        type: 'enum',
        default: 'step',
        values: [
          { value: 'step', label: 'рывком' },
          { value: 'flow', label: 'плавно' },
        ],
      },
    ],
  },
  run: (r) => {
    const salt = Math.imul(r.option<number>('seed') | 0, 7919);
    const flow = r.option<string>('motion') === 'flow';
    const [period, scale] = [r.num('period'), r.num('scale')];
    const { time } = r.ctx;
    const channel =
      (n: number): Field =>
      (poses) => {
        const out = new Float64Array(poses.length);
        if (!flow && typeof period === 'number' && scale === 1) {
          // Частый случай — дрожание: такт один на всех и считается раз на кадр.
          const t = (period > 0 ? Math.floor(time / Math.max(1, period)) : 0) * 3 + n + salt;
          for (let i = 0; i < out.length; i++) out[i] = poseNoise(poses[i], t, 1) * 2 - 1;
          return out;
        }
        const periods = sample(period, poses);
        const scales = sample(scale, poses);
        for (let i = 0; i < out.length; i++) {
          const v = periods[i];
          const tick = v > 0 ? time / Math.max(1, v) : 0;
          const t0 = Math.floor(tick);
          const at = (t: number): number => poseNoise(poses[i], t * 3 + n + salt, scales[i]);
          // Плавно — от такта к такту без рывка; рывком — новое число раз в период.
          const value = flow ? at(t0) + (at(t0 + 1) - at(t0)) * smooth(tick - t0) : at(t0);
          out[i] = value * 2 - 1;
        }
        return out;
      };
    return { x: channel(0), y: channel(1), z: channel(2) };
  },
  animated: (node, linked) => linked('period') || (node.values.period ?? 100) > 0,
};

export const gradientNode: NodeImpl = {
  spec: {
    kind: 'gradient',
    label: 'Градиент',
    category: 'field',
    hint: 'От 0 к 1 и обратно вдоль оси или от центра, по исходным ячейкам; бежит со временем',
    inputs: [
      numIn('length', 'Длина', 12, LENGTH_MIN, LENGTH_MAX),
      numIn('period', 'Период, мс', 2000, 0, PERIOD_MAX),
    ],
    outputs: [numOut('value', 'Градиент')],
    options: [
      {
        name: 'axis',
        label: 'Ось',
        type: 'enum',
        default: 'x',
        values: [
          { value: 'x', label: 'по X' },
          { value: 'y', label: 'по Y' },
          { value: 'radial', label: 'от центра' },
        ],
      },
    ],
  },
  run: (r) => {
    const axis = r.option<string>('axis');
    const { center, time } = r.ctx;
    const aspect = r.ctx.aspect ?? 1;
    const length = r.num('length');
    const period = r.num('period');
    const field: Field = (poses) => {
      const lengths = sample(length, poses);
      const periods = sample(period, poses);
      const out = new Float64Array(poses.length);
      for (let i = 0; i < out.length; i++) {
        const key = poses[i].key;
        const dx = xOf(key) + 0.5 - center.x;
        const dy = yOf(key) + 0.5 - center.y;
        const along = axis === 'x' ? dx : axis === 'y' ? dy : Math.hypot(dx * aspect, dy);
        const per = periods[i];
        const u = along / Math.max(0.01, lengths[i]) - (per > 0 ? time / per : 0);
        // Туда и обратно: градиент замыкается, и бегущий цвет не прыгает на стыке.
        out[i] = 1 - Math.abs(2 * (u - Math.floor(u)) - 1);
      }
      return out;
    };
    return { value: field };
  },
  animated: (node, linked) => linked('period') || (node.values.period ?? 2000) > 0,
};
