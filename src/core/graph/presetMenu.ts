import type { GlyphMaterial } from '../material';
import { DEFAULT_DITHER, DEFAULT_GLOW, DEFAULT_OUTLINE, DEFAULT_SHINE } from '../material';
import type { SkinBone } from '../skin';
import { type DeformerKind, createDeformer } from './legacy';
import { type Fragment, fragmentOfDeformer, fragmentsOfMaterial } from './presets';

/**
 * Меню «Добавить»: сборки, которые встают в поток перед выводом. Это не отдельные узлы, а
 * готовые цепочки из словаря: «Волна» — синус на сдвиг, её можно разобрать и пересобрать.
 */
export type PresetKind =
  Exclude<DeformerKind, 'skin'> | 'bones' | 'outline' | 'glow' | 'shine' | 'dither';

export interface Preset {
  readonly kind: PresetKind;
  readonly label: string;
  readonly group: 'Движение' | 'Цвет и символ' | 'Материал';
}

export const PRESETS: readonly Preset[] = [
  { kind: 'wave', label: 'Волна', group: 'Движение' },
  { kind: 'jitter', label: 'Дрожание', group: 'Движение' },
  { kind: 'twist', label: 'Вихрь', group: 'Движение' },
  { kind: 'bend', label: 'Изгиб', group: 'Движение' },
  { kind: 'explode', label: 'Разлёт', group: 'Движение' },
  { kind: 'scaleFalloff', label: 'Размер от центра', group: 'Движение' },
  { kind: 'particles', label: 'Частицы', group: 'Движение' },
  { kind: 'bones', label: 'Кости', group: 'Движение' },
  { kind: 'colorRamp', label: 'Градиент цвета', group: 'Цвет и символ' },
  { kind: 'glyphRamp', label: 'Символы по яркости', group: 'Цвет и символ' },
  { kind: 'outline', label: 'Контур', group: 'Материал' },
  { kind: 'glow', label: 'Свечение', group: 'Материал' },
  { kind: 'shine', label: 'Блик', group: 'Материал' },
  { kind: 'dither', label: 'Дизеринг', group: 'Материал' },
];

const EMPTY: GlyphMaterial = { outline: null, glow: null, shine: null, dither: null };

const MATERIALS: Readonly<Record<string, GlyphMaterial>> = {
  outline: { ...EMPTY, outline: DEFAULT_OUTLINE },
  glow: { ...EMPTY, glow: DEFAULT_GLOW },
  shine: { ...EMPTY, shine: DEFAULT_SHINE },
  dither: { ...EMPTY, dither: DEFAULT_DITHER },
};

/**
 * Сборка с числами по умолчанию. `base` — основа идентификаторов её узлов: одна на объект, чтобы
 * у объекта во всех кадрах узлы совпали. Кости привязываются к `bones` — позе покоя сейчас.
 */
export function presetFragment(
  kind: PresetKind,
  base: string,
  bones: readonly SkinBone[] = [],
): Fragment {
  if (kind === 'bones') return fragmentOfDeformer({ ...createDeformer('skin', base), bones });
  const material = MATERIALS[kind] as GlyphMaterial | undefined;
  if (material) return fragmentsOfMaterial(base, material)[0];
  return fragmentOfDeformer(createDeformer(kind as Exclude<DeformerKind, 'skin'>, base));
}
