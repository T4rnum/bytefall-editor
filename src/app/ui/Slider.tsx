import { NumberField } from './NumberField';
import { snapToStep } from './numeric';

export interface SliderProps {
  readonly value: number;
  /** Вызывается непрерывно во время перетаскивания. */
  readonly onChange: (value: number) => void;
  /**
   * Вызывается один раз в конце жеста. Нужен там, где промежуточные значения не должны
   * попадать в историю. Если не задан, фиксацией считается onChange.
   */
  readonly onCommit?: (value: number) => void;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly label?: string;
  readonly suffix?: string;
  readonly disabled?: boolean;
  /** Показывать числовое поле справа. Отключается там, где значение и так очевидно. */
  readonly readout?: boolean;
  readonly className?: string;
}

/**
 * Ползунок с точным вводом. Ползунок даёт быстрый грубый подбор, поле справа — точное значение;
 * без второго настройки вроде непрозрачности невозможно выставить повторяемо.
 */
export function Slider({
  value,
  onChange,
  onCommit,
  min,
  max,
  step = 1,
  label,
  suffix,
  disabled = false,
  readout = true,
  className,
}: SliderProps) {
  const range = { min, max, step };
  const end = (raw: number): void => {
    const next = snapToStep(Number(raw), range);
    onChange(next);
    onCommit?.(next);
  };

  return (
    <div className={`slider${className ? ` ${className}` : ''}`}>
      {label !== undefined && <span className="slider-label">{label}</span>}
      <input
        type="range"
        className="slider-track"
        min={min}
        max={max}
        // step="any" — чтобы бегунок стоял ровно там, где значение, включая дробные значения
        // после перетаскивания с Shift. Округление к шагу делаем сами в onChange.
        step="any"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(snapToStep(Number(e.target.value), range))}
        // Ползунок меняется непрерывно, а в историю должно попасть одно значение,
        // поэтому фиксация идёт по отпусканию указателя и клавиши.
        onPointerUp={(e) => end(Number(e.currentTarget.value))}
        onKeyUp={(e) => end(Number(e.currentTarget.value))}
        onBlur={(e) => end(Number(e.currentTarget.value))}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {readout && (
        <NumberField
          value={value}
          onChange={onChange}
          onCommit={onCommit}
          min={min}
          max={max}
          step={step}
          suffix={suffix}
          disabled={disabled}
          width="var(--field-w-sm)"
        />
      )}
    </div>
  );
}
