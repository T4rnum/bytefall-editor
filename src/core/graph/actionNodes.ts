import { colorOf } from '../cellBuffer';
import { MAX_SCALE, MIN_SCALE } from '../transform';
import { FREE, glyphsIn, glyphsOut, numIn } from './specs';
import { type NodeImpl, sample } from './types';

/**
 * Действия: поток символов на входе, тот же поток на выходе, каждый символ изменён по числам с
 * входов. Число с поля у каждого символа своё, без связи — одно на всех.
 */

export const offsetNode: NodeImpl = {
  spec: {
    kind: 'offset',
    label: 'Сдвиг',
    category: 'action',
    hint: 'Сдвигает символы на X и Y, умноженные на силу',
    inputs: [
      glyphsIn(),
      numIn('x', 'X', 0, -FREE, FREE),
      numIn('y', 'Y', 0, -FREE, FREE),
      numIn('strength', 'Сила', 1, -64, 64),
    ],
    outputs: [glyphsOut()],
    options: [],
  },
  run: (r) => {
    const poses = r.glyphs('glyphs');
    // Числа — до сдвига: поле положения читает символы там, где они были.
    const [x, y, s] = ['x', 'y', 'strength'].map((n) => sample(r.num(n), poses));
    for (let i = 0; i < poses.length; i++) {
      const k = s[i];
      poses[i].x += k * x[i];
      poses[i].y += k * y[i];
    }
    return { glyphs: poses };
  },
};

export const rotateNode: NodeImpl = {
  spec: {
    kind: 'rotate',
    label: 'Поворот',
    category: 'action',
    hint: 'Поворачивает символы на угол, умноженный на силу: каждый вокруг себя или вокруг центра',
    inputs: [
      glyphsIn(),
      numIn('angle', 'Угол, °', 0, -FREE, FREE),
      numIn('strength', 'Сила', 1, -720, 720),
    ],
    outputs: [glyphsOut()],
    options: [
      {
        name: 'pivot',
        label: 'Вокруг',
        type: 'enum',
        default: 'glyph',
        values: [
          { value: 'glyph', label: 'себя' },
          { value: 'center', label: 'центра объекта' },
        ],
      },
    ],
  },
  run: (r) => {
    const poses = r.glyphs('glyphs');
    const [angle, s] = ['angle', 'strength'].map((n) => sample(r.num(n), poses));
    const around = r.option<string>('pivot') === 'center';
    const { x: cx, y: cy } = r.ctx.center;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      const a = s[i] * angle[i];
      if (around) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const rad = (a * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        p.x = cx + dx * cos - dy * sin;
        p.y = cy + dx * sin + dy * cos;
      }
      p.rot += a;
    }
    return { glyphs: poses };
  },
};

export const scaleNode: NodeImpl = {
  spec: {
    kind: 'scale',
    label: 'Размер',
    category: 'action',
    hint: 'Умножает размер символов на число',
    inputs: [glyphsIn(), numIn('factor', 'Во сколько', 1, MIN_SCALE, MAX_SCALE)],
    outputs: [glyphsOut()],
    options: [],
  },
  run: (r) => {
    const poses = r.glyphs('glyphs');
    const factor = sample(r.num('factor'), poses);
    for (let i = 0; i < poses.length; i++) {
      const f = factor[i];
      poses[i].sx *= f;
      poses[i].sy *= f;
    }
    return { glyphs: poses };
  },
};

export const colorNode: NodeImpl = {
  spec: {
    kind: 'color',
    label: 'Цвет',
    category: 'action',
    hint: 'Красит символы цветом между двумя: число 0 — первый, 1 — второй',
    inputs: [
      glyphsIn(),
      numIn('factor', 'Между', 0, -FREE, FREE),
      numIn('amount', 'Сила', 1, 0, 1),
    ],
    outputs: [glyphsOut()],
    options: [
      { name: 'from', label: 'Цвет 1', type: 'color', default: '#29adff' },
      { name: 'to', label: 'Цвет 2', type: 'color', default: '#ff77a8' },
    ],
  },
  run: (r) => {
    const poses = r.glyphs('glyphs');
    const from = colorOf(r.option<string>('from'));
    const to = colorOf(r.option<string>('to'));
    const [factor, amount] = ['factor', 'amount'].map((n) => sample(r.num(n), poses));
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      const t = factor[i];
      const k = Math.min(1, Math.max(0, amount[i]));
      p.fg = {
        r: p.fg.r + (from.r + (to.r - from.r) * t - p.fg.r) * k,
        g: p.fg.g + (from.g + (to.g - from.g) * t - p.fg.g) * k,
        b: p.fg.b + (from.b + (to.b - from.b) * t - p.fg.b) * k,
        a: p.fg.a,
      };
    }
    return { glyphs: poses };
  },
};

export const glyphNode: NodeImpl = {
  spec: {
    kind: 'glyph',
    label: 'Символ',
    category: 'action',
    hint: 'Меняет символ на символ из ряда: число 0 — первый, 1 — последний',
    inputs: [glyphsIn(), numIn('factor', 'Где в ряду', 0, -FREE, FREE)],
    outputs: [glyphsOut()],
    options: [{ name: 'ramp', label: 'Ряд', type: 'text', default: '.:-=+*#%@', maxLength: 64 }],
  },
  run: (r) => {
    const poses = r.glyphs('glyphs');
    const ramp = [...r.option<string>('ramp')];
    if (ramp.length === 0) return { glyphs: poses };
    const factor = sample(r.num('factor'), poses);
    const last = ramp.length - 1;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      if (p.glyph === '') continue;
      const index = Math.floor(factor[i] * ramp.length);
      p.glyph = ramp[Math.min(last, Math.max(0, index))];
    }
    return { glyphs: poses };
  },
};

export const bendNode: NodeImpl = {
  spec: {
    kind: 'bend',
    label: 'Изгиб',
    category: 'action',
    hint: 'Сгибает строку дугой: градусов на ячейку от центра',
    inputs: [glyphsIn(), numIn('strength', 'Сила, °', 10, -90, 90)],
    outputs: [glyphsOut()],
    options: [],
  },
  run: (r) => {
    const poses = r.glyphs('glyphs');
    const strength = sample(r.num('strength'), poses);
    const { x: cx, y: cy } = r.ctx.center;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      const k = (strength[i] * Math.PI) / 180;
      if (Math.abs(k) < 1e-9) continue;
      const radius = 1 / k;
      // Центр дуги на радиус ниже центра объекта; символ ниже средней линии — ближе к нему.
      const theta = k * (p.x - cx);
      const reach = radius - (p.y - cy);
      p.x = cx + reach * Math.sin(theta);
      p.y = cy + radius - reach * Math.cos(theta);
      p.rot += (theta * 180) / Math.PI;
    }
    return { glyphs: poses };
  },
};
