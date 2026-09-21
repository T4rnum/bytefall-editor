import type { ReactNode } from 'react';

export interface FieldProps {
  readonly label: string;
  readonly children: ReactNode;
  /** Подпись сверху, а не слева: для широких контролов. */
  readonly stacked?: boolean;
  readonly title?: string;
  readonly className?: string;
}

/**
 * Строка «подпись — контрол». Нужна, чтобы подписи в разных панелях выравнивались одинаково,
 * а не каждая по-своему.
 */
export function Field({ label, children, stacked = false, title, className }: FieldProps) {
  const classes = ['field', stacked ? 'field--stacked' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} title={title}>
      <span className="field-label">{label}</span>
      <div className="field-control">{children}</div>
    </div>
  );
}

export interface FieldGroupProps {
  readonly children: ReactNode;
  /** Число колонок. По умолчанию одна. */
  readonly columns?: 1 | 2;
  readonly className?: string;
}

/** Сетка полей. Два столбца — предел: дальше подписи не помещаются в сайдбар. */
export function FieldGroup({ children, columns = 1, className }: FieldGroupProps) {
  return (
    <div className={`field-group field-group--${columns}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
