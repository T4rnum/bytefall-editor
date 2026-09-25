import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';

export interface FieldProps {
  readonly label: string;
  readonly children: ReactNode;
  /** Подпись сверху, а не слева: для широких контролов. */
  readonly stacked?: boolean;
  readonly title?: string;
  readonly className?: string;
  /**
   * Сброс к значению по умолчанию. Задаётся, только когда значение от него отличается, см.
   * `resetTo`: тогда между подписью и контролом появляется кнопка.
   */
  readonly onReset?: () => void;
}

/**
 * Строка «подпись — контрол». Нужна, чтобы подписи в разных панелях выравнивались одинаково,
 * а не каждая по-своему. Кнопка сброса занимает место подписи, а не контрола: столбцы полей и
 * ромбов ключей не съезжают, когда она появляется.
 */
export function Field({ label, children, stacked = false, title, className, onReset }: FieldProps) {
  const classes = ['field', stacked ? 'field--stacked' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} title={title}>
      <span className="field-label">
        <span className="field-label-text">{label}</span>
        {onReset && (
          <Button
            icon
            size="sm"
            className="field-reset"
            label={`Сбросить: ${label.toLowerCase()}`}
            onClick={onReset}
          >
            <RotateCcw size={12} />
          </Button>
        )}
      </span>
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
