import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Button, ColorField, Field, Select } from '../../ui';
import { THEME_BASES, THEME_TOKENS, setThemeToken } from '../../workspace/theme';

/** Цвета токенов, как они сейчас на корне документа: основа темы и правки поверх неё. */
function currentColors(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    THEME_TOKENS.map(({ token }) => [token, style.getPropertyValue(token).trim().toLowerCase()]),
  );
}

/**
 * Редактор темы: основа — тёмная или светлая, — и любой цвет из токенов поверх неё. Правка
 * видна сразу во всём редакторе и в окнах панелей, сброс у цвета возвращает цвет основы.
 */
export function ThemeDialog() {
  const open = useUiStore((s) => s.themeOpen);
  const setOpen = useUiStore((s) => s.setThemeOpen);
  const theme = useWorkspaceStore((s) => s.theme);
  const setTheme = useWorkspaceStore((s) => s.setTheme);
  const ref = useRef<HTMLDialogElement>(null);
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Тема ложится на документ эффектом App, поэтому цвета читаются на следующем кадре.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setColors(currentColors()));
    return () => cancelAnimationFrame(frame);
  }, [open, theme]);

  return (
    <dialog ref={ref} className="dialog" onClose={() => setOpen(false)}>
      <div className="dialog-content theme-dialog">
        <h2>Тема оформления</h2>
        <Field label="Основа">
          <Select
            value={theme.base}
            options={THEME_BASES.map((b) => ({ value: b.id, label: b.label }))}
            size="sm"
            ariaLabel="Основа темы"
            onChange={(base) => setTheme({ ...theme, base })}
          />
        </Field>
        <div className="theme-tokens">
          {THEME_TOKENS.map(({ token, label }) => (
            <Field
              key={token}
              label={label}
              onReset={
                theme.overrides[token]
                  ? () => setTheme(setThemeToken(theme, token, null))
                  : undefined
              }
            >
              <ColorField
                value={colors[token] ?? null}
                size="sm"
                label={label}
                onChange={(c) => c && setTheme(setThemeToken(theme, token, c.slice(0, 7)))}
              />
            </Field>
          ))}
        </div>
        <div className="dialog-actions">
          <Button
            disabled={Object.keys(theme.overrides).length === 0}
            onClick={() => setTheme({ ...theme, overrides: {} })}
          >
            Вернуть цвета основы
          </Button>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Готово
          </Button>
        </div>
      </div>
    </dialog>
  );
}
