import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'ghost' | 'primary' | 'danger';
export type ControlSize = 'sm' | 'md' | 'lg';

/** Подпись для подсказки: «Сохранить (Ctrl+S)». Горячая клавиша всегда видна пользователю. */
export function tooltip(label: string, hotkey?: string): string {
  return hotkey ? `${label} (${hotkey})` : label;
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  readonly variant?: ButtonVariant;
  readonly size?: ControlSize;
  /** Квадратная кнопка под одну иконку. */
  readonly icon?: boolean;
  /** Кнопка-переключатель во включённом состоянии. */
  readonly active?: boolean;
  /** Текст подсказки. С hotkey складывается в «Текст (клавиша)». */
  readonly label?: string;
  readonly hotkey?: string;
  readonly children?: ReactNode;
}

/**
 * Единственная кнопка на весь редактор. Разница между панелью инструментов, тулбаром и
 * диалогом — это variant и size, а не отдельный компонент со своими стилями.
 */
export function Button({
  variant = 'ghost',
  size = 'md',
  icon = false,
  active = false,
  label,
  hotkey,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    icon ? 'btn--icon' : '',
    active ? 'is-active' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      title={label ? tooltip(label, hotkey) : undefined}
      aria-label={icon ? label : undefined}
      aria-pressed={active || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
