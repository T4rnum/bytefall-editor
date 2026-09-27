import { FREE, lift, numIn, numOut } from './specs';
import type { Field, NodeImpl } from './types';

/**
 * Поля: число для каждого символа из его положения, цвета и времени. Сами символы поле не
 * трогает — числа забирают действия. Узоры — волна, шум, градиент — в `patternNodes.ts`.
 */

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
    const x: Field = (poses) => {
      const out = new Float64Array(poses.length);
      for (let i = 0; i < out.length; i++) out[i] = poses[i].x - c.x;
      return out;
    };
    const y: Field = (poses) => {
      const out = new Float64Array(poses.length);
      for (let i = 0; i < out.length; i++) out[i] = poses[i].y - c.y;
      return out;
    };
    return { x, y };
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
    const aspect = r.ctx.aspect ?? 1;
    const value: Field = (poses) => {
      const out = new Float64Array(poses.length);
      for (let i = 0; i < out.length; i++)
        out[i] = Math.hypot((poses[i].x - x) * aspect, poses[i].y - y);
      return out;
    };
    return { value };
  },
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
    value: (poses) => {
      const out = new Float64Array(poses.length);
      for (let i = 0; i < out.length; i++) {
        const { r, g, b } = poses[i].fg;
        out[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      return out;
    },
  }),
};
