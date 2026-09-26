import { newId } from '../document';
import type { SkinBone } from '../skin';

/**
 * Стек деформеров версий 7–9 (до графа узлов). В документе его больше нет: файлы этих версий
 * мигрируют в граф (`presets.ts`, `fragmentOfDeformer`). Числа деформера остались параметрами
 * сборок — меню «Добавить» собирает волну из узлов с теми же числами по умолчанию.
 */
export type DeformerKind =
  | 'wave'
  | 'jitter'
  | 'twist'
  | 'scaleFalloff'
  | 'colorRamp'
  | 'bend'
  | 'explode'
  | 'glyphRamp'
  | 'particles'
  | 'skin';

export interface DeformerCommon {
  readonly id: string;
  readonly kind: DeformerKind;
  readonly enabled: boolean;
}

/** Волна: символы смещаются синусоидой вдоль `axis`, волна бежит поперёк смещения. */
export interface WaveDeformer extends DeformerCommon {
  readonly kind: 'wave';
  readonly axis: 'x' | 'y';
  /** Размах, ячейки. */
  readonly amplitude: number;
  /** Длина волны, ячейки. */
  readonly wavelength: number;
  /** Период, мс. */
  readonly period: number;
}

/** Дрожание: каждый символ сдвинут и повёрнут по шуму, шум меняется раз в период. */
export interface JitterDeformer extends DeformerCommon {
  readonly kind: 'jitter';
  readonly amplitude: number;
  /** Наибольший поворот, градусы. */
  readonly angle: number;
  readonly period: number;
  /** Явное зерно шума: одно и то же зерно — одно и то же дрожание, в любом порядке кадров. */
  readonly seed: number;
}

/** Вихрь: символ повёрнут вокруг центра объекта тем сильнее, чем дальше от центра. */
export interface TwistDeformer extends DeformerCommon {
  readonly kind: 'twist';
  /** Градусы на ячейку расстояния. */
  readonly strength: number;
}

/** Размер символа по расстоянию от центра: `inner` в центре, `outer` на радиусе и дальше. */
export interface ScaleFalloffDeformer extends DeformerCommon {
  readonly kind: 'scaleFalloff';
  readonly radius: number;
  readonly inner: number;
  readonly outer: number;
}

/** Цвет символов по градиенту от `from` к `to` и обратно; с периодом градиент бежит. */
export interface ColorRampDeformer extends DeformerCommon {
  readonly kind: 'colorRamp';
  readonly from: string;
  readonly to: string;
  readonly axis: 'x' | 'y' | 'radial';
  /** Сколько ячеек на полный проход градиента туда и обратно. */
  readonly length: number;
  /** Мс на полный проход; 0 — градиент стоит. */
  readonly period: number;
  /** Насколько сильно цвет градиента заменяет свой цвет символа, 0..1. */
  readonly amount: number;
}

/** Изгиб: строка объекта ложится на дугу, символы встают поперёк неё. */
export interface BendDeformer extends DeformerCommon {
  readonly kind: 'bend';
  /** Градусы поворота дуги на ячейку; больше нуля — концы уходят вниз. */
  readonly strength: number;
}

/** Разлёт: символы уходят от центра, каждый ещё и крутится по шуму. */
export interface ExplodeDeformer extends DeformerCommon {
  readonly kind: 'explode';
  /** 0 — на месте, 1 — вдвое дальше от центра. */
  readonly amount: number;
  /** Наибольший поворот при разлёте на единицу, градусы. */
  readonly angle: number;
  readonly seed: number;
}

/** Символ по яркости своего цвета: тёмный берёт начало ряда, светлый — конец. */
export interface GlyphRampDeformer extends DeformerCommon {
  readonly kind: 'glyphRamp';
  readonly glyphs: string;
}

export type Deformer =
  | WaveDeformer
  | JitterDeformer
  | TwistDeformer
  | ScaleFalloffDeformer
  | ColorRampDeformer
  | BendDeformer
  | ExplodeDeformer
  | GlyphRampDeformer
  | ParticlesDeformer
  | SkinDeformer;

export interface DeformerByKind {
  readonly wave: WaveDeformer;
  readonly jitter: JitterDeformer;
  readonly twist: TwistDeformer;
  readonly scaleFalloff: ScaleFalloffDeformer;
  readonly colorRamp: ColorRampDeformer;
  readonly bend: BendDeformer;
  readonly explode: ExplodeDeformer;
  readonly glyphRamp: GlyphRampDeformer;
  readonly particles: ParticlesDeformer;
  readonly skin: SkinDeformer;
}

export const MAX_DEFORMERS_PER_OBJECT = 8;

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

/** Скиннинг: символы объекта едут за костями. */
export interface SkinDeformer extends DeformerCommon {
  readonly kind: 'skin';
  readonly bones: readonly SkinBone[];
  /** На сколько ячеек дальше ближней кости ещё тянет соседняя: мягкость сгиба. */
  readonly falloff: number;
}

const DEFAULTS: { readonly [K in DeformerKind]: (id: string) => DeformerByKind[K] } = {
  wave: (id) => ({
    id,
    kind: 'wave',
    enabled: true,
    axis: 'y',
    amplitude: 1,
    wavelength: 8,
    period: 1000,
  }),
  jitter: (id) => ({
    id,
    kind: 'jitter',
    enabled: true,
    amplitude: 0.15,
    angle: 10,
    period: 100,
    seed: 1,
  }),
  twist: (id) => ({ id, kind: 'twist', enabled: true, strength: 10 }),
  scaleFalloff: (id) => ({
    id,
    kind: 'scaleFalloff',
    enabled: true,
    radius: 6,
    inner: 1.5,
    outer: 0.5,
  }),
  bend: (id) => ({ id, kind: 'bend', enabled: true, strength: 10 }),
  explode: (id) => ({ id, kind: 'explode', enabled: true, amount: 0.5, angle: 90, seed: 1 }),
  glyphRamp: (id) => ({ id, kind: 'glyphRamp', enabled: true, glyphs: '.:-=+*#%@' }),
  skin: (id) => ({ id, kind: 'skin', enabled: true, bones: [], falloff: 1.5 }),
  particles: (id) => ({
    id,
    kind: 'particles',
    enabled: true,
    glyphs: '@*+.',
    from: '#ffec27',
    to: '#ff004d',
    rate: 20,
    life: 1500,
    speed: 4,
    angle: -90,
    spread: 60,
    gravity: 1,
    seed: 1,
  }),
  colorRamp: (id) => ({
    id,
    kind: 'colorRamp',
    enabled: true,
    from: '#29adff',
    to: '#ff77a8',
    axis: 'x',
    length: 12,
    period: 2000,
    amount: 1,
  }),
};

export function createDeformer<K extends DeformerKind>(
  kind: K,
  id: string = newId('deform'),
): DeformerByKind[K] {
  return DEFAULTS[kind](id);
}
