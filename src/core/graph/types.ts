import type { Affine } from '../affine';
import type { Rgba } from '../color';
import type { CellGrid, CellKey } from '../grid';
import type { GlyphMaterial } from '../material';
import type { SkinBone } from '../skin';

/**
 * Граф узлов на объекте (DESIGN.md, раздел 4.3; ROADMAP, слой 11). По связям течёт поток
 * символов объекта, узлы-поля дают числа для каждого символа, узлы-действия меняют символы по
 * этим числам, как геоноды Blender. Узел «Объект» даёт символы объекта, «Вывод» — то, что
 * рисуется.
 */

/**
 * Символ по ходу графа: центр в ячейках объекта, поворот в градусах, масштаб, цвета и материал.
 * `key` — ячейка, из которой символ родом: по ней шум и градиенты узнают символ, куда бы его
 * ни унесло раньше по графу. У частицы это ячейка, из которой она вылетела, а `particle` — её
 * номер; у символов объекта он null.
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
  /** Материал символа: контур, свечение, блик, дизеринг. Нет — символ без материала. */
  material?: GlyphMaterial | null;
}

/** Что течёт по связи: поток символов или число (для каждого символа своё, если это поле). */
export type SocketType = 'glyphs' | 'number';

export interface InputSpec {
  readonly name: string;
  readonly label: string;
  readonly type: SocketType;
  /** Значение числа на незанятом входе. */
  readonly default?: number;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

export interface OutputSpec {
  readonly name: string;
  readonly label: string;
  readonly type: SocketType;
}

/** Настройка узла, которая не вход: не соединяется и не анимируется. */
export type OptionSpec =
  | {
      readonly name: string;
      readonly label: string;
      readonly type: 'enum';
      readonly values: readonly { readonly value: string; readonly label: string }[];
      readonly default: string;
    }
  | {
      readonly name: string;
      readonly label: string;
      readonly type: 'text';
      readonly default: string;
      readonly maxLength: number;
    }
  | {
      readonly name: string;
      readonly label: string;
      readonly type: 'color';
      readonly default: string;
    }
  | {
      readonly name: string;
      readonly label: string;
      readonly type: 'number';
      readonly default: number;
      readonly min: number;
      readonly max: number;
      readonly integer?: boolean;
    }
  | { readonly name: string; readonly label: string; readonly type: 'bones' };

export type OptionValue = string | number | readonly SkinBone[];

/**
 * Поле — число для каждого символа; действие меняет поток; генератор рождает новый поток;
 * материал задаёт символам вид на GPU; служебный узел сводит потоки.
 */
export type NodeCategory =
  'input' | 'field' | 'action' | 'generator' | 'material' | 'utility' | 'output';

export interface NodeSpec {
  readonly kind: string;
  readonly label: string;
  readonly category: NodeCategory;
  /** Одной строкой: что делает узел. Её показывает меню и подсказка. */
  readonly hint: string;
  readonly inputs: readonly InputSpec[];
  readonly outputs: readonly OutputSpec[];
  readonly options: readonly OptionSpec[];
}

export interface GraphNode {
  readonly id: string;
  readonly kind: string;
  /** Выключенное действие пропускает поток как есть, генератор ничего не рождает. */
  readonly muted: boolean;
  /** Место в редакторе узлов, в ячейках его сетки. На результат не влияет. */
  readonly x: number;
  readonly y: number;
  /** Числа на незанятых входах. Нет значения — берётся значение по умолчанию. */
  readonly values: Readonly<Record<string, number>>;
  readonly options: Readonly<Record<string, OptionValue>>;
}

/** Связь выхода `out` узла `from` со входом `in` узла `to`. На вход — не больше одной связи. */
export interface GraphLink {
  readonly from: string;
  readonly out: string;
  readonly to: string;
  readonly in: string;
}

export interface NodeGraph {
  readonly nodes: readonly GraphNode[];
  readonly links: readonly GraphLink[];
}

/** Узлы, которые есть в каждом графе: символы объекта на входе и то, что рисуется, на выходе. */
export const INPUT_NODE = 'in';
export const OUTPUT_NODE = 'out';

/** Чем граф считается: время, центр содержимого, кости скиннинга, ячейки объекта. */
export interface GraphContext {
  /** Время сцены, мс. */
  readonly time: number;
  /** Центр содержимого объекта в его ячейках. */
  readonly center: { readonly x: number; readonly y: number };
  /** Кости скиннинга сейчас в координатах объекта, см. `skinRig`. */
  readonly rig?: ReadonlyMap<string, Affine>;
  readonly cells: CellGrid;
}

/** Число на связи: одно на всех или своё у каждого символа. */
export type NumberSource = number | ((p: GlyphPose) => number);

export const valueAt = (source: NumberSource, p: GlyphPose): number =>
  typeof source === 'number' ? source : source(p);

/** Что узел видит при вычислении: свои входы, настройки и контекст графа. */
export interface NodeRun {
  readonly node: GraphNode;
  readonly ctx: GraphContext;
  num(name: string): NumberSource;
  /** Поток на входе. Он принадлежит узлу: его можно менять на месте. */
  glyphs(name: string): GlyphPose[];
  option<T extends OptionValue>(name: string): T;
}

export type NodeOutputs = Readonly<Record<string, NumberSource | GlyphPose[]>>;

export interface NodeImpl {
  readonly spec: NodeSpec;
  run(run: NodeRun): NodeOutputs;
  /**
   * Меняется ли результат узла со временем при таких входах. Нужно экспорту и часам эффектов:
   * граф без таких узлов — статичная картинка.
   */
  animated?(node: GraphNode, linked: (input: string) => boolean): boolean;
}
