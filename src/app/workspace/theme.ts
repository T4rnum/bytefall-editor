/**
 * Тема оформления поверх токенов `styles/tokens.css` (DESIGN.md, раздел 9): основа — тёмная или
 * светлая, объявленная в токенах, — и правки отдельных цветов поверх неё. Правка — значение
 * CSS-переменной на корне документа, поэтому ни один компонент о теме не знает.
 */
export type ThemeBase = 'dark' | 'light';

export const THEME_BASES: readonly { readonly id: ThemeBase; readonly label: string }[] = [
  { id: 'dark', label: 'Тёмная' },
  { id: 'light', label: 'Светлая' },
];

export interface Theme {
  readonly base: ThemeBase;
  /** Цвета поверх основы: имя токена → #rrggbb. */
  readonly overrides: Readonly<Record<string, string>>;
}

export const DEFAULT_THEME: Theme = { base: 'dark', overrides: {} };

export interface ThemeToken {
  readonly token: string;
  readonly label: string;
}

/** Цвета, которые правит редактор темы. Полупрозрачные состояния считаются от них сами. */
export const THEME_TOKENS: readonly ThemeToken[] = [
  { token: '--workspace', label: 'Рабочая область' },
  { token: '--bg', label: 'Фон' },
  { token: '--panel', label: 'Панели' },
  { token: '--panel-raised', label: 'Поля и кнопки' },
  { token: '--panel-overlay', label: 'Всплывающее' },
  { token: '--border', label: 'Границы' },
  { token: '--border-strong', label: 'Границы ярче' },
  { token: '--text', label: 'Текст' },
  { token: '--text-dim', label: 'Текст приглушённый' },
  { token: '--text-faint', label: 'Текст бледный' },
  { token: '--accent', label: 'Акцент' },
  { token: '--accent-hover', label: 'Акцент под указателем' },
  { token: '--accent-text', label: 'Текст на акценте' },
  { token: '--danger', label: 'Опасное действие' },
  { token: '--danger-text', label: 'Текст на опасном' },
];

const HEX = /^#[0-9a-f]{6}$/;
const KNOWN = new Set(THEME_TOKENS.map((t) => t.token));

/** Тема из хранилища: чужие токены и не-цвета выбрасываются, основа — из известных. */
export function restoreTheme(raw: unknown): Theme {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_THEME;
  const { base, overrides } = raw as { base?: unknown; overrides?: unknown };
  const known = THEME_BASES.find((b) => b.id === base)?.id ?? 'dark';
  const clean: Record<string, string> = {};
  if (typeof overrides === 'object' && overrides !== null) {
    for (const [token, value] of Object.entries(overrides)) {
      if (!KNOWN.has(token) || typeof value !== 'string') continue;
      const hex = value.toLowerCase();
      if (HEX.test(hex)) clean[token] = hex;
    }
  }
  return { base: known, overrides: clean };
}

/** Тема с новым цветом токена; null — вернуть цвет основы. */
export function setThemeToken(theme: Theme, token: string, value: string | null): Theme {
  const overrides = { ...theme.overrides };
  if (value === null) delete overrides[token];
  else overrides[token] = value.toLowerCase();
  return { ...theme, overrides };
}
