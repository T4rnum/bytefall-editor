const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
];

/**
 * «Сколько времени назад» для людей: точное время записи восстановления интересует меньше, чем
 * то, вчерашняя это работа или пятиминутная.
 */
export function formatAge(ageMs: number, locale = 'en'): string {
  if (ageMs < MINUTE) return 'just now';
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (ageMs >= size) return format.format(-Math.floor(ageMs / size), unit);
  }
  return 'just now';
}
