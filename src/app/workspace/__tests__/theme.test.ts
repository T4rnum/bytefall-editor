import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, restoreTheme, setThemeToken } from '../theme';

describe('тема оформления', () => {
  it('из хранилища: известная основа и только цвета известных токенов', () => {
    expect(
      restoreTheme({
        base: 'light',
        overrides: {
          '--accent': '#FF00AA',
          '--bg': 'red',
          '--evil': '#000000',
          '--text': 42,
        },
      }),
    ).toEqual({ base: 'light', overrides: { '--accent': '#ff00aa' } });
    expect(restoreTheme({ base: 'neon' })).toEqual(DEFAULT_THEME);
    expect(restoreTheme('nope')).toBe(DEFAULT_THEME);
  });

  it('правка токена и возврат к основе', () => {
    const edited = setThemeToken(DEFAULT_THEME, '--accent', '#00FF00');
    expect(edited.overrides).toEqual({ '--accent': '#00ff00' });
    expect(DEFAULT_THEME.overrides).toEqual({});
    expect(setThemeToken(edited, '--accent', null).overrides).toEqual({});
  });
});
