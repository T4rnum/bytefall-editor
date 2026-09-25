import type { Rgba } from './color';
import { applyDeformer } from './deformerKinds';
import { newId } from './document';
import type { CellKey } from './grid';
import type { ParticlesDeformer } from './particles';
import { MAX_SCALE, MIN_SCALE } from './transform';
import type { DeformerParam } from './tracks';

/**
 * Деформеры (DESIGN.md, раздел 4.3): функции «символы объекта → символы объекта» с несколькими
 * параметрами. Лежат на объекте списком, порядок важен, как модификаторы в Blender. Работают в
 * координатах объекта, поэтому волна идёт вдоль его осей и едет вместе с ним.
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
  | 'particles';

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
  | ParticlesDeformer;

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
}

export const MAX_DEFORMERS_PER_OBJECT = 8;

export interface DeformerParamSpec {
  readonly min: number;
  readonly max: number;
}

const PERIOD: DeformerParamSpec = { min: 10, max: 600000 };
const LENGTH: DeformerParamSpec = { min: 0.5, max: 2048 };
const SCALE: DeformerParamSpec = { min: MIN_SCALE, max: MAX_SCALE };

/** Числовые параметры каждого вида с пределами: по ним ограничиваются ключи и поля. */
export const DEFORMER_PARAM_SPECS: {
  readonly [K in DeformerKind]: Readonly<Partial<Record<DeformerParam, DeformerParamSpec>>>;
} = {
  wave: { amplitude: { min: 0, max: 64 }, wavelength: LENGTH, period: PERIOD },
  jitter: { amplitude: { min: 0, max: 8 }, angle: { min: 0, max: 360 }, period: PERIOD },
  twist: { strength: { min: -360, max: 360 } },
  scaleFalloff: { radius: LENGTH, inner: SCALE, outer: SCALE },
  colorRamp: { length: LENGTH, period: { min: 0, max: 600000 }, amount: { min: 0, max: 1 } },
  bend: { strength: { min: -90, max: 90 } },
  explode: { amount: { min: 0, max: 16 }, angle: { min: 0, max: 720 } },
  glyphRamp: {},
  particles: {
    life: { min: 20, max: 10000 },
    speed: { min: 0, max: 128 },
    angle: { min: -360, max: 360 },
    spread: { min: 0, max: 360 },
    gravity: { min: -128, max: 128 },
  },
};

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

/**
 * Стек для копии объекта: те же деформеры под новыми идентификаторами. Ключи находят деформер по
 * идентификатору, и общий у оригинала и копии двигал бы их вместе. `ids` задаёт новые снаружи,
 * чтобы копия одного объекта в разных кадрах получила одни и те же.
 */
export function copyDeformers(
  deformers: readonly Deformer[],
  ids?: ReadonlyMap<string, string>,
): Deformer[] {
  return deformers.map((d) => ({ ...d, id: ids?.get(d.id) ?? newId('deform') }));
}

export const hasActiveDeformers = (deformers: readonly Deformer[]): boolean =>
  deformers.some((d) => d.enabled);

/**
 * Символ объекта по ходу стека: центр в ячейках объекта, поворот в градусах, масштаб, цвета.
 * `key` — ячейка, из которой символ родом: по ней шум и градиенты узнают символ, куда бы его
 * ни унесли деформеры раньше по стеку. У частицы это ячейка, из которой она вылетела, а
 * `particle` — её номер: по нему шум отличает искры одной ячейки. У символов объекта он null.
 */
export interface GlyphPose {
  readonly key: CellKey;
  readonly particle: number | null;
  glyph: string;
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  fg: Rgba;
  bg: Rgba;
}

export interface DeformContext {
  /** Время сцены, мс. */
  readonly time: number;
  /** Центр содержимого объекта в его ячейках. */
  readonly center: { readonly x: number; readonly y: number };
}

/**
 * Прогоняет символы через включённые деформеры по порядку. Позы меняются на месте: стек
 * получает свежий массив, собранный из объекта, поэтому снаружи это чистая функция времени.
 */
export function deform(
  poses: GlyphPose[],
  deformers: readonly Deformer[],
  ctx: DeformContext,
): GlyphPose[] {
  for (const deformer of deformers) if (deformer.enabled) applyDeformer(poses, deformer, ctx);
  return poses;
}
