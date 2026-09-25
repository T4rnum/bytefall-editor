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

/** Палитра одной строкой: так она хранится в настройках и показывается в поле. */
export const formatPalette = (colors: readonly string[]): string => colors.join(' ');
