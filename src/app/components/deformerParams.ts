import type { DeformerKind } from '../../core/deformers';

/** Виды деформеров в списке «добавить»: значения уходят в файл, подписи — для людей. */
export const DEFORMER_KIND_OPTIONS: readonly {
  readonly value: DeformerKind;
  readonly label: string;
}[] = [
  { value: 'wave', label: 'Волна' },
  { value: 'jitter', label: 'Дрожание' },
  { value: 'twist', label: 'Вихрь' },
  { value: 'scaleFalloff', label: 'Размер от центра' },
  { value: 'colorRamp', label: 'Градиент' },
  { value: 'bend', label: 'Изгиб' },
  { value: 'explode', label: 'Разлёт' },
  { value: 'glyphRamp', label: 'Символы по яркости' },
  { value: 'particles', label: 'Частицы' },
  { value: 'skin', label: 'Кости' },
];

export type Param =
  | {
      readonly key: string;
      readonly label: string;
      readonly type: 'number';
      readonly min: number;
      readonly max: number;
      readonly step: number;
    }
  | { readonly key: string; readonly label: string; readonly type: 'color' }
  | { readonly key: string; readonly label: string; readonly type: 'text' }
  | {
      readonly key: string;
      readonly label: string;
      readonly type: 'select';
      readonly options: readonly { readonly value: string; readonly label: string }[];
    };

const num = (key: string, label: string, min: number, max: number, step: number): Param => ({
  key,
  label,
  type: 'number',
  min,
  max,
  step,
});
const AXIS = { key: 'axis', label: 'Ось', type: 'select' as const };
const period = num('period', 'Период, мс', 10, 600000, 50);

/** Параметры каждого вида: поле знает свои пределы, а файл проверяет те же. */
export const DEFORMER_FIELDS: { readonly [K in DeformerKind]: readonly Param[] } = {
  wave: [
    {
      ...AXIS,
      options: [
        { value: 'y', label: 'Вверх-вниз' },
        { value: 'x', label: 'Вбок' },
      ],
    },
    num('amplitude', 'Размах', 0, 64, 0.1),
    num('wavelength', 'Длина волны', 0.5, 2048, 0.5),
    period,
  ],
  jitter: [
    num('amplitude', 'Размах', 0, 8, 0.05),
    num('angle', 'Угол, °', 0, 360, 1),
    period,
    num('seed', 'Зерно', 0, 2147483647, 1),
  ],
  twist: [num('strength', 'Сила, °/ячейку', -360, 360, 1)],
  scaleFalloff: [
    num('radius', 'Радиус', 0.5, 2048, 0.5),
    num('inner', 'В центре', 0.1, 32, 0.05),
    num('outer', 'На краю', 0.1, 32, 0.05),
  ],
  colorRamp: [
    { key: 'from', label: 'Цвет от', type: 'color' },
    { key: 'to', label: 'Цвет до', type: 'color' },
    {
      ...AXIS,
      options: [
        { value: 'x', label: 'По X' },
        { value: 'y', label: 'По Y' },
        { value: 'radial', label: 'От центра' },
      ],
    },
    num('length', 'Длина', 0.5, 2048, 0.5),
    num('period', 'Период, мс', 0, 600000, 50),
    num('amount', 'Сила', 0, 1, 0.05),
  ],
  bend: [num('strength', 'Сила, °/ячейку', -90, 90, 1)],
  explode: [
    num('amount', 'Разлёт', 0, 16, 0.05),
    num('angle', 'Вращение, °', 0, 720, 5),
    num('seed', 'Зерно', 0, 2147483647, 1),
  ],
  glyphRamp: [{ key: 'glyphs', label: 'Ряд от тёмного к светлому', type: 'text' }],
  particles: [
    { key: 'glyphs', label: 'Символы по возрасту', type: 'text' },
    { key: 'from', label: 'Цвет в начале', type: 'color' },
    { key: 'to', label: 'Цвет в конце', type: 'color' },
    num('rate', 'В секунду', 0, 200, 1),
    num('life', 'Жизнь, мс', 20, 10000, 50),
    num('speed', 'Скорость', 0, 128, 0.5),
    num('angle', 'Направление, °', -360, 360, 5),
    num('spread', 'Разброс, °', 0, 360, 5),
    num('gravity', 'Тяжесть', -128, 128, 0.5),
    num('seed', 'Зерно', 0, 2147483647, 1),
  ],
  skin: [num('falloff', 'Мягкость сгиба', 0.25, 64, 0.25)],
};
