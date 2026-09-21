import { useEffect, useRef, useState } from 'react';
import type { ControlSize } from './Button';

export interface TextFieldProps {
  readonly value: string;
  /** Вызывается на Enter и на потере фокуса, но не на каждый символ. */
  readonly onCommit: (value: string) => void;
  readonly placeholder?: string;
  readonly size?: ControlSize;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly ariaLabel?: string;
  /** Моноширинный пиксельный шрифт: для полей с глифами. */
  readonly pixel?: boolean;
  readonly maxLength?: number;
  readonly className?: string;
}

/**
 * Текстовое поле с отложенной записью: правка применяется на Enter или потере фокуса, а Escape
 * откатывает. Панели раньше повторяли этот приём вручную через defaultValue и key, из-за чего
 * поле теряло ввод при любой посторонней перерисовке.
 */
export function TextField({
  value,
  onCommit,
  placeholder,
  size = 'md',
  disabled = false,
  title,
  ariaLabel,
  pixel = false,
  maxLength,
  className,
}: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  /** Escape снимает фокус, а blur пишет значение. Флаг говорит blur, что запись отменена. */
  const cancelled = useRef(false);

  // Внешнее изменение подхватывается, только пока поле не редактируют.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = (text: string): void => {
    if (text !== value) onCommit(text);
  };

  const classes = [
    'textfield',
    `textfield--${size}`,
    pixel ? 'textfield--pixel' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <input
      className={classes}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => (focused.current = true)}
      onBlur={(e) => {
        focused.current = false;
        if (cancelled.current) {
          cancelled.current = false;
          setDraft(value);
          return;
        }
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        // Глобальные горячие клавиши не должны срабатывать поверх ввода текста.
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
