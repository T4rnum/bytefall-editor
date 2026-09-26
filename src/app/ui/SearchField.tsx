import { useEffect, useRef } from 'react';
import type { ControlSize } from './Button';

export interface SearchFieldProps {
  readonly value: string;
  /** Зовётся на каждый символ: поиск фильтрует список сразу. */
  readonly onChange: (value: string) => void;
  /** Enter: взять первый найденный. */
  readonly onSubmit?: () => void;
  /** Escape: закрыть то, в чём ищут. */
  readonly onCancel?: () => void;
  readonly placeholder?: string;
  readonly ariaLabel: string;
  readonly size?: ControlSize;
  /** Забрать фокус при появлении: поле открывается вместе с меню, и печатать можно сразу. */
  readonly autoFocus?: boolean;
}

/**
 * Поле поиска: в отличие от `TextField`, значение уходит на каждый символ, а Enter и Escape —
 * команды того, в чём ищут, а не запись и откат.
 */
export function SearchField({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  ariaLabel,
  size = 'md',
  autoFocus = false,
}: SearchFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <input
      ref={ref}
      type="search"
      className={`textfield textfield--${size}`}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onSubmit) {
          e.preventDefault();
          onSubmit();
        } else if (e.key === 'Escape' && onCancel) {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    />
  );
}
