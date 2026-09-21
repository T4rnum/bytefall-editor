import type { ControlSize } from './Button';

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SelectProps<T extends string> {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly SelectOption<T>[];
  readonly size?: ControlSize;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
  readonly title?: string;
  readonly className?: string;
}

/**
 * Обёртка над нативным select. Свой выпадающий список писать не стали: нативный бесплатно даёт
 * клавиатуру, поиск по первым буквам и правильное поведение у края экрана, а выглядит он ровно
 * так, как скажут токены.
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  disabled = false,
  ariaLabel,
  title,
  className,
}: SelectProps<T>) {
  const classes = ['select', `select--${size}`, className ?? ''].filter(Boolean).join(' ');
  return (
    <select
      className={classes}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Список значений одного типа в options без ручного дублирования подписей. */
export function optionsOf<T extends string>(values: readonly T[]): SelectOption<T>[] {
  return values.map((value) => ({ value, label: value }));
}
