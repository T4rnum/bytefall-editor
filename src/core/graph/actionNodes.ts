import { colorOf } from '../cellBuffer';
import { MAX_SCALE, MIN_SCALE } from '../transform';
import { FREE, glyphsIn, glyphsOut, numIn } from './specs';
import { type NodeImpl, valueAt } from './types';

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
    const [x, y, s] = [r.num('x'), r.num('y'), r.num('strength')];
    for (const p of poses) {
      // Оба числа — до сдвига: поле положения читает символ там, где он был.
      const dx = valueAt(x, p);
      const dy = valueAt(y, p);
      const k = valueAt(s, p);
      p.x += k * dx;
      p.y += k * dy;
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
    const [angle, s] = [r.num('angle'), r.num('strength')];
    const around = r.option<string>('pivot') === 'center';
    const { x: cx, y: cy } = r.ctx.center;
    for (const p of poses) {
      const a = valueAt(s, p) * valueAt(angle, p);
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
    const factor = r.num('factor');
    for (const p of poses) {
      const f = valueAt(factor, p);
      p.sx *= f;
      p.sy *= f;
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
    const [factor, amount] = [r.num('factor'), r.num('amount')];
    for (const p of poses) {
      const t = valueAt(factor, p);
      const k = Math.min(1, Math.max(0, valueAt(amount, p)));
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
    const factor = r.num('factor');
    const last = ramp.length - 1;
    for (const p of poses) {
      if (p.glyph === '') continue;
      const i = Math.floor(valueAt(factor, p) * ramp.length);
      p.glyph = ramp[Math.min(last, Math.max(0, i))];
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
    const strength = r.num('strength');
    const { x: cx, y: cy } = r.ctx.center;
    for (const p of poses) {
      const k = (valueAt(strength, p) * Math.PI) / 180;
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
