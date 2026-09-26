/** Больше цветов в своей палитре не бывает: подбор ближайшего цвета идёт по каждому. */
export const MAX_PALETTE_COLORS = 256;

const byte = (n: number): string => Math.min(255, n).toString(16).padStart(2, '0');

/** Цвет из строки «R G B имя» форматов GIMP и JASC; остальные строки дают null. */
function decimalColor(line: string): string | null {
  const m = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(\s|$)/.exec(line);
  return m ? `#${byte(Number(m[1]))}${byte(Number(m[2]))}${byte(Number(m[3]))}` : null;
}

/**
 * Цвет из шестнадцатеричного слова. С решёткой — как в CSS: #rgb, #rrggbb, #rrggbbaa. Без неё —
 * rrggbb из списков Lospec и aarrggbb из Paint.NET. Три цифры без решётки — скорее число, чем цвет.
 */
function hexColor(word: string): string | null {
  const hash = word.startsWith('#');
  const digits = (hash ? word.slice(1) : word).toLowerCase();
  if (!/^[0-9a-f]+$/.test(digits)) return null;
  if (digits.length === 6) return `#${digits}`;
  if (digits.length === 8) return `#${hash ? digits.slice(0, 6) : digits.slice(2)}`;
  if (digits.length === 3 && hash) return `#${[...digits].map((c) => c + c).join('')}`;
  return null;
}

/**
 * Палитра из текста: файлы GIMP (.gpl), JASC (.pal), Paint.NET (.txt), список Lospec (.hex) или
 * цвета, вставленные через пробел и запятую. Прозрачность отбрасывается: цвета палитры
 * непрозрачные. Повторы убираются, порядок остаётся как в файле.
 */
export function parsePalette(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const head = lines.find((line) => line.trim() !== '')?.trim() ?? '';
  const decimal = head.startsWith('GIMP Palette') || head === 'JASC-PAL';
  const found = decimal
    ? lines.map(decimalColor)
    : lines
        .filter((line) => !/^\s*(;|\/\/)/.test(line))
        .flatMap((line) => line.split(/[^0-9a-fA-F#]+/))
        .map(hexColor);
  const colors = new Set(found.filter((c): c is string => c !== null));
  return [...colors].slice(0, MAX_PALETTE_COLORS);
}

/** Цвет из LAB (L 0..100, a и b около ±128, белая точка D65) в sRGB. */
function labToHex(l: number, a: number, b: number): string {
  const fy = (l + 16) / 116;
  const f = (t: number): number => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const [x, y, z] = [0.95047 * f(fy + a / 500), f(fy), 1.08883 * f(fy - b / 200)];
  const linear = [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  ];
  const gamma = (c: number): number =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055;
  return rgbToHex(linear.map(gamma));
}

const rgbToHex = (rgb: readonly number[]): string =>
  `#${rgb.map((c) => byte(Math.round(Math.max(0, Math.min(1, c)) * 255))).join('')}`;

/** Сколько чисел у цвета каждой модели ASE. */
const ASE_CHANNELS: Readonly<Record<string, number>> = { 'RGB ': 3, CMYK: 4, Gray: 1, 'LAB ': 3 };

/**
 * Цвет одного блока ASE по его модели. Незнакомая модель и числа, не влезающие в блок до `end`,
 * цвета не дают.
 */
function aseColor(view: DataView, at: number, end: number, model: string): string | null {
  const channels = ASE_CHANNELS[model] as number | undefined;
  if (channels === undefined || at + channels * 4 > end) return null;
  const f = (i: number): number => view.getFloat32(at + i * 4);
  switch (model) {
    case 'RGB ':
      return rgbToHex([f(0), f(1), f(2)]);
    case 'CMYK':
      return rgbToHex([0, 1, 2].map((i) => (1 - f(i)) * (1 - f(3))));
    case 'Gray':
      return rgbToHex([f(0), f(0), f(0)]);
    case 'LAB ':
      return labToHex(f(0) * 100, f(1), f(2));
    default:
      return null;
  }
}

/**
 * Палитра из Adobe Swatch Exchange (.ase): заголовок `ASEF`, затем блоки. Цвет — блок 0x0001:
 * имя в UTF-16, модель из четырёх букв и числа float32. Группы и имена пропускаются, файл,
 * оборванный на середине, отдаёт цвета, что успел. Не ASE — пустой список.
 */
export function parseAse(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  if (bytes.length < 12 || tag !== 'ASEF') return [];
  const colors = new Set<string>();
  let at = 12;
  for (let n = view.getUint32(8); n > 0 && at + 6 <= bytes.length; n--) {
    const type = view.getUint16(at);
    const length = view.getUint32(at + 2);
    const start = at + 6;
    at = start + length;
    if (type !== 0x0001 || at > bytes.length) continue;
    const modelAt = start + 2 + view.getUint16(start) * 2;
    const model = String.fromCharCode(...bytes.subarray(modelAt, modelAt + 4));
    const color = aseColor(view, modelAt + 4, at, model);
    if (color) colors.add(color);
  }
  return [...colors].slice(0, MAX_PALETTE_COLORS);
}

/** Палитра одной строкой: так она хранится в настройках и показывается в поле. */
export const formatPalette = (colors: readonly string[]): string => colors.join(' ');
