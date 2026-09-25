import { colorOf } from './cellBuffer';
import { type Rgba, TRANSPARENT } from './color';
import type { DeformContext, DeformerCommon, GlyphPose } from './deformers';
import { hashNoise } from './effects';

/**
 * Частицы: символы вылетают из символов объекта и гаснут. Он не двигает символы, а добавляет
 * новые, но живёт в том же стеке: деформеры после него двигают и красят и частицы.
 */
export interface ParticlesDeformer extends DeformerCommon {
  readonly kind: 'particles';
  /** Ряд символов, по которому частица стареет. */
  readonly glyphs: string;
  /** Цвет новой частицы и цвет к концу жизни. */
  readonly from: string;
  readonly to: string;
  /** Частиц в секунду. */
  readonly rate: number;
  /** Сколько живёт частица, мс. */
  readonly life: number;
  /** Ячеек в секунду. */
  readonly speed: number;
  /** Направление, градусы по часовой от оси X: −90 — вверх. */
  readonly angle: number;
  /** Разброс направления, градусы. */
  readonly spread: number;
  /** Ускорение вниз, ячеек в секунду за секунду. */
  readonly gravity: number;
  readonly seed: number;
}

/** Больше живых частиц у одного деформера не бывает: 200 в секунду по 10 секунд жизни. */
export const MAX_PARTICLES = 2000;

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
 * всё остальное — из какого символа объекта она вылетела, направление, скорость — берётся из шума
 * по её номеру и зерну. Положение в момент t — формула от возраста, поэтому перемотка в любую
 * точку даёт то же, что проигрывание, и кэш не нужен. Поэтому же частота не ведётся ключами:
 * новая частота передвинула бы рождение всех частиц разом.
 *
 * Рождение идёт и до нуля: в первый момент сцены частицы уже летят, а не начинают с пустоты.
 * Частицы встают в начало стека символов: объект рисуется поверх, и искры выходят из-за него.
 */
export function emitParticles(poses: GlyphPose[], d: ParticlesDeformer, ctx: DeformContext): void {
  const glyphs = [...d.glyphs];
  if (poses.length === 0 || glyphs.length === 0 || d.rate <= 0 || d.life <= 0) return;
  const from = colorOf(d.from);
  const to = colorOf(d.to);
  const t = ctx.time / 1000;
  const life = d.life / 1000;
  // Живые — кто уже родился и ещё не дожил до конца: 0 ≤ возраст < life. Сверх предела — младшие.
  const last = Math.floor(t * d.rate);
  const first = Math.max(Math.floor((t - life) * d.rate) + 1, last - MAX_PARTICLES + 1);
  const salt = Math.imul(d.seed | 0, 7919);
  const born: GlyphPose[] = [];
  for (let i = first; i <= last; i++) {
    const noise = (n: number): number => hashNoise(i, n, salt);
    const age = t - i / d.rate;
    const u = age / life;
    const source = poses[Math.floor(noise(0) * poses.length)];
    const angle = ((d.angle + (noise(1) - 0.5) * d.spread) * Math.PI) / 180;
    const speed = d.speed * (0.5 + noise(2));
    born.push({
      key: source.key,
      particle: i,
      // Символ стареет по ряду: от первого к последнему, как искра, что гаснет.
      glyph: glyphs[Math.min(glyphs.length - 1, Math.floor(u * glyphs.length))],
      x: source.x + Math.cos(angle) * speed * age,
      y: source.y + Math.sin(angle) * speed * age + 0.5 * d.gravity * age * age,
      rot: 0,
      sx: 1,
      sy: 1,
      fg: ageColor(from, to, u),
      bg: TRANSPARENT,
    });
  }
  poses.unshift(...born);
}
