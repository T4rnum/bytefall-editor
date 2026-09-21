import type { ReactNode } from 'react';

export interface CheckboxProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly ariaLabel?: string;
  readonly className?: string;
}

/** Флажок с подписью. Вся область подписи кликабельна: попадать в 13 пикселей квадрата незачем. */
export function Checkbox({
  checked,
  onChange,
  children,
  disabled = false,
  title,
  ariaLabel,
  className,
}: CheckboxProps) {
  return (
    <label
      className={`checkbox${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
      title={title}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children !== undefined && <span className="checkbox-label">{children}</span>}
    </label>
  );
}
