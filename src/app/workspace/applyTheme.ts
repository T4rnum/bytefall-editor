import { THEME_TOKENS, type Theme } from './theme';

/**
 * Тема на документ: основа — атрибутом на корне, правки — значениями переменных. Документов
 * бывает несколько: у панели в отдельном окне свой.
 */
export function applyTheme(doc: Document, theme: Theme): void {
  const root = doc.documentElement;
  if (theme.base === 'dark') delete root.dataset.theme;
  else root.dataset.theme = theme.base;
  for (const { token } of THEME_TOKENS) {
    const value = theme.overrides[token];
    if (value) root.style.setProperty(token, value);
    else root.style.removeProperty(token);
  }
}
