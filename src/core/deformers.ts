import type { Rgba } from './color';
import { applyDeformer } from './deformerKinds';
import { newId } from './document';
import type { CellKey } from './grid';

/**
 * Деформеры (DESIGN.md, раздел 4.3): функции «символы объекта → символы объекта» с несколькими
 * параметрами. Лежат на объекте списком, порядок важен, как модификаторы в Blender. Работают в
 * координатах объекта, поэтому волна идёт вдоль его осей и едет вместе с ним.
 */
export type DeformerKind = 'wave' | 'jitter' | 'twist' | 'scaleFalloff' | 'colorRamp';

interface DeformerCommon {
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

export type Deformer =
  WaveDeformer | JitterDeformer | TwistDeformer | ScaleFalloffDeformer | ColorRampDeformer;

export interface DeformerByKind {
  readonly wave: WaveDeformer;
  readonly jitter: JitterDeformer;
  readonly twist: TwistDeformer;
  readonly scaleFalloff: ScaleFalloffDeformer;
  readonly colorRamp: ColorRampDeformer;
}

export const MAX_DEFORMERS_PER_OBJECT = 8;

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

export const hasActiveDeformers = (deformers: readonly Deformer[]): boolean =>
  deformers.some((d) => d.enabled);

/**
 * Символ объекта по ходу стека: центр в ячейках объекта, поворот в градусах, масштаб, цвета.
 * `key` — ячейка, из которой символ родом: по ней шум и градиенты узнают символ, куда бы его
 * ни унесли деформеры раньше по стеку.
 */
export interface GlyphPose {
  readonly key: CellKey;
  readonly glyph: string;
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
