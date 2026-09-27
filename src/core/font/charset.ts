/**
 * Группы символов для палитры: только то, что в шрифте есть. Порядок групп — от частого к
 * редкому; всё, что не попало в группы, уходит в «Прочее».
 */
export interface GlyphGroup {
  readonly title: string;
  readonly chars: string;
}

type Range = readonly [number, number];

const GROUPS: readonly { readonly title: string; readonly ranges: readonly Range[] }[] = [
  { title: 'ASCII', ranges: [[0x21, 0x7e]] },
  {
    title: 'Латиница',
    ranges: [
      [0xa1, 0x24f],
      [0x1e00, 0x1eff],
    ],
  },
  { title: 'Греческий', ranges: [[0x370, 0x3ff]] },
  { title: 'Кириллица', ranges: [[0x400, 0x52f]] },
  { title: 'Рамки и блоки', ranges: [[0x2500, 0x259f]] },
  {
    title: 'Знаки',
    ranges: [
      [0x2010, 0x24ff],
      [0x25a0, 0x2bff],
    ],
  },
];

/** В «Прочем» не больше: шрифт с иероглифами дал бы палитру в десятки тысяч кнопок. */
export const MAX_OTHER_GLYPHS = 1024;

/** Не символы: управляющие, пробелы, мягкий перенос, надстрочные знаки, суррогаты, личная зона. */
function invisible(c: number): boolean {
  return (
    c <= 0x20 ||
    (c >= 0x7f && c <= 0xa0) ||
    c === 0xad ||
    (c >= 0x300 && c <= 0x36f) ||
    (c >= 0x2000 && c <= 0x200f) ||
    (c >= 0x2028 && c <= 0x202f) ||
    (c >= 0x205f && c <= 0x206f) ||
    (c >= 0xd800 && c <= 0xf8ff) ||
    c === 0xfeff
  );
}

const inRanges = (c: number, ranges: readonly Range[]): boolean =>
  ranges.some(([from, to]) => c >= from && c <= to);

export function glyphGroups(codePoints: Iterable<number>): GlyphGroup[] {
  const buckets = GROUPS.map(() => [] as number[]);
  const other: number[] = [];
  for (const c of codePoints) {
    if (invisible(c)) continue;
    const group = GROUPS.findIndex((g) => inRanges(c, g.ranges));
    if (group >= 0) buckets[group].push(c);
    else if (other.length < MAX_OTHER_GLYPHS) other.push(c);
  }
  const groups = GROUPS.map((g, i) => ({ title: g.title, points: buckets[i] }));
  groups.push({ title: 'Прочее', points: other });
  return groups
    .filter((g) => g.points.length > 0)
    .map((g) => ({
      title: g.title,
      chars: String.fromCodePoint(...g.points.sort((a, b) => a - b)),
    }));
}
