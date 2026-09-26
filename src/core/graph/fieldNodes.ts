import { hashNoise } from '../effects';
import { xOf, yOf } from '../grid';
import { FREE, LENGTH_MAX, LENGTH_MIN, PERIOD_MAX, lift, numIn, numOut } from './specs';
import type { GlyphPose, NodeImpl, NumberSource } from './types';

/**
 * Поля: число для каждого символа из его положения, исходной ячейки, цвета и времени. Сами
 * символы поле не трогает — числа забирают действия.
 */

const TAU = Math.PI * 2;

export const valueNode: NodeImpl = {
  spec: {
    kind: 'value',
    label: 'Число',
    category: 'field',
    hint: 'Одно число на всех: его можно подать на несколько входов и анимировать ключами',
    inputs: [numIn('value', 'Значение', 1, -FREE, FREE)],
    outputs: [numOut('value', 'Число')],
    options: [],
  },
  run: (r) => ({ value: r.num('value') }),
};

export const timeNode: NodeImpl = {
  spec: {
    kind: 'time',
    label: 'Время',
    category: 'field',
    hint: 'Время сцены в секундах',
    inputs: [],
    outputs: [numOut('seconds', 'Секунды')],
    options: [],
  },
  run: (r) => ({ seconds: r.ctx.time / 1000 }),
  animated: () => true,
};

type MathOp = 'add' | 'subtract' | 'multiply' | 'divide' | 'min' | 'max' | 'power' | 'abs';

const OPS: Readonly<Record<MathOp, (a: number, b: number) => number>> = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => (b === 0 ? 0 : a / b),
  min: Math.min,
  max: Math.max,
  power: (a, b) => {
    const v = Math.pow(a, b);
    return Number.isFinite(v) ? v : 0;
  },
  abs: (a) => Math.abs(a),
};

export const mathNode: NodeImpl = {
  spec: {
    kind: 'math',
    label: 'Математика',
    category: 'field',
    hint: 'Два числа в одно: сложить, умножить, взять меньшее',
    inputs: [numIn('a', 'A', 0, -FREE, FREE), numIn('b', 'B', 1, -FREE, FREE)],
    outputs: [numOut('value', 'Число')],
    options: [
      {
        name: 'op',
        label: 'Действие',
        type: 'enum',
        default: 'multiply',
        values: [
          { value: 'add', label: 'Сложить' },
          { value: 'subtract', label: 'Вычесть' },
          { value: 'multiply', label: 'Умножить' },
          { value: 'divide', label: 'Разделить' },
          { value: 'min', label: 'Меньшее' },
          { value: 'max', label: 'Большее' },
          { value: 'power', label: 'Степень' },
          { value: 'abs', label: 'Модуль A' },
        ],
      },
    ],
  },
  run: (r) => ({ value: lift(OPS[r.option<MathOp>('op')], r.num('a'), r.num('b')) }),
};

export const mapRangeNode: NodeImpl = {
  spec: {
    kind: 'mapRange',
    label: 'Диапазон',
    category: 'field',
    hint: 'Число из одного диапазона в другой: расстояние 0…6 в размер 1.5…0.5',
    inputs: [
      numIn('value', 'Число', 0, -FREE, FREE),
      numIn('fromMin', 'Из, от', 0, -FREE, FREE),
      numIn('fromMax', 'Из, до', 1, -FREE, FREE),
      numIn('toMin', 'В, от', 0, -FREE, FREE),
      numIn('toMax', 'В, до', 1, -FREE, FREE),
    ],
    outputs: [numOut('value', 'Число')],
    options: [
      {
        name: 'clamp',
        label: 'За краями',
        type: 'enum',
        default: 'clamp',
        values: [
          { value: 'clamp', label: 'Обрезать' },
          { value: 'extend', label: 'Продолжать' },
        ],
      },
    ],
  },
  run: (r) => {
    const clamp = r.option<string>('clamp') === 'clamp';
    const map = (v: number, fromMin: number, fromMax: number, toMin: number, toMax: number) => {
      const span = fromMax - fromMin;
      let t = span === 0 ? 0 : (v - fromMin) / span;
      if (clamp) t = Math.min(1, Math.max(0, t));
      return toMin + (toMax - toMin) * t;
    };
    const names = ['value', 'fromMin', 'fromMax', 'toMin', 'toMax'];
    return { value: lift(map, ...names.map((n) => r.num(n))) };
  },
};

export const positionNode: NodeImpl = {
  spec: {
    kind: 'position',
    label: 'Положение',
    category: 'field',
    hint: 'Где символ сейчас, в ячейках объекта: от его начала или от центра',
    inputs: [],
    outputs: [numOut('x', 'X'), numOut('y', 'Y')],
    options: [
      {
        name: 'origin',
        label: 'От',
        type: 'enum',
        default: 'object',
        values: [
          { value: 'object', label: 'начала объекта' },
          { value: 'center', label: 'центра' },
        ],
      },
    ],
  },
  run: (r) => {
    const c = r.option<string>('origin') === 'center' ? r.ctx.center : { x: 0, y: 0 };
    return { x: (p: GlyphPose) => p.x - c.x, y: (p: GlyphPose) => p.y - c.y };
  },
};

export const distanceNode: NodeImpl = {
  spec: {
    kind: 'distance',
    label: 'Расстояние',
    category: 'field',
    hint: 'Как далеко символ от центра объекта, в ячейках',
    inputs: [],
    outputs: [numOut('value', 'Расстояние')],
    options: [],
  },
  run: (r) => {
    const { x, y } = r.ctx.center;
    return { value: (p: GlyphPose) => Math.hypot(p.x - x, p.y - y) };
  },
};

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
    const names = ['value', 'wavelength', 'period', 'phase'];
    return { value: lift(wave, ...names.map((n) => r.num(n))) };
  },
  animated: (node, linked) => linked('period') || (node.values.period ?? 1000) > 0,
};

/**
 * Шум символа по его исходной ячейке, куда бы его ни унесло раньше по графу. Частица берёт свой
 * номер, иначе все искры одной ячейки дрожали бы как одна; строки −1 у ячеек не бывает.
 */
const poseNoise = (p: GlyphPose, t: number): number =>
  p.particle === null ? hashNoise(xOf(p.key), yOf(p.key), t) : hashNoise(p.particle, -1, t);

export const noiseNode: NodeImpl = {
  spec: {
    kind: 'noise',
    label: 'Шум',
    category: 'field',
    hint: 'Случайное число от −1 до 1 у каждого символа, три независимых; меняется раз в период',
    inputs: [numIn('period', 'Период, мс', 100, 0, PERIOD_MAX)],
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
    ],
  },
  run: (r) => {
    const salt = Math.imul(r.option<number>('seed') | 0, 7919);
    const period = r.num('period');
    const tick = (p: GlyphPose): number => {
      const v = typeof period === 'number' ? period : period(p);
      return v > 0 ? Math.floor(r.ctx.time / Math.max(1, v)) : 0;
    };
    const channel =
      (n: number): NumberSource =>
      (p: GlyphPose) =>
        poseNoise(p, tick(p) * 3 + n + salt) * 2 - 1;
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
    const along = (p: GlyphPose): number => {
      const dx = xOf(p.key) + 0.5 - center.x;
      const dy = yOf(p.key) + 0.5 - center.y;
      return axis === 'x' ? dx : axis === 'y' ? dy : Math.hypot(dx, dy);
    };
    const length = r.num('length');
    const period = r.num('period');
    return {
      value: (p: GlyphPose) => {
        const per = typeof period === 'number' ? period : period(p);
        const len = typeof length === 'number' ? length : length(p);
        const u = along(p) / Math.max(0.01, len) - (per > 0 ? time / per : 0);
        // Туда и обратно: градиент замыкается, и бегущий цвет не прыгает на стыке.
        return 1 - Math.abs(2 * (u - Math.floor(u)) - 1);
      },
    };
  },
  animated: (node, linked) => linked('period') || (node.values.period ?? 2000) > 0,
};

export const brightnessNode: NodeImpl = {
  spec: {
    kind: 'brightness',
    label: 'Яркость',
    category: 'field',
    hint: 'Яркость цвета символа: 0 — чёрный, 1 — белый',
    inputs: [],
    outputs: [numOut('value', 'Яркость')],
    options: [],
  },
  run: () => ({
    value: (p: GlyphPose) => 0.2126 * p.fg.r + 0.7152 * p.fg.g + 0.0722 * p.fg.b,
  }),
};
