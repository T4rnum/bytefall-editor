import { useMemo, useRef } from 'react';
import { NumberField } from './NumberField';
import {
  type DragMode,
  type NumericRange,
  dragModeOf,
  trackFraction,
  valueFromNudge,
  valueFromTrackDrag,
  valueFromTrackPosition,
} from './numeric';

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

interface TrackDrag {
  readonly pointerId: number;
  startX: number;
  startValue: number;
  mode: DragMode;
  lastValue: number;
}

/**
 * Ползунок с точным вводом. Дорожка даёт быстрый грубый подбор, поле справа — точное значение;
 * без второго настройки вроде непрозрачности невозможно выставить повторяемо.
 *
 * Дорожка своя, а не `input[type=range]`: нативная не знает про Shift и Ctrl, из-за чего
 * модификаторы работали в поле, но не работали на самой дорожке.
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
  const range: NumericRange = useMemo(() => ({ min, max, step }), [min, max, step]);
  const drag = useRef<TrackDrag | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const emit = (next: number): void => {
    if (next !== value) onChange(next);
  };

  const commit = (next: number): void => {
    emit(next);
    onCommit?.(next);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (disabled || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const mode = dragModeOf(event);
    // Нажатие сразу ставит бегунок под курсор, дальше жест идёт относительно этой точки.
    const start = valueFromTrackPosition(event.clientX, rect.left, rect.width, range, mode);
    event.currentTarget.focus();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* без захвата жест оборвётся на границе дорожки */
    }
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: start,
      mode,
      lastValue: start,
    };
    emit(start);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const width = trackRef.current?.getBoundingClientRect().width ?? 0;

    // Модификатор можно зажать посреди жеста: отсчёт начинается заново от текущего значения.
    const mode = dragModeOf(event);
    if (mode !== state.mode) {
      state.mode = mode;
      state.startX = event.clientX;
      state.startValue = state.lastValue;
      return;
    }

    state.lastValue = valueFromTrackDrag(
      state.startValue,
      event.clientX - state.startX,
      width,
      range,
      mode,
    );
    emit(state.lastValue);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* захвата не было */
    }
    commit(state.lastValue);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    const mode = dragModeOf(event);
    const keys: Record<string, () => number> = {
      ArrowLeft: () => valueFromNudge(value, -1, range, mode),
      ArrowDown: () => valueFromNudge(value, -1, range, mode),
      ArrowRight: () => valueFromNudge(value, 1, range, mode),
      ArrowUp: () => valueFromNudge(value, 1, range, mode),
      Home: () => min,
      End: () => max,
    };
    const next = keys[event.key];
    if (!next) return;
    // Гасим событие: стрелки нужны и активному инструменту, и глобальным сочетаниям.
    event.preventDefault();
    event.stopPropagation();
    commit(next());
  };

  const fraction = trackFraction(value, range);

  return (
    <div className={`slider${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}>
      {label !== undefined && <span className="slider-label">{label}</span>}
      <div
        ref={trackRef}
        className="slider-track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="slider-fill" style={{ width: `${fraction * 100}%` }} />
        <div className="slider-thumb" style={{ left: `${fraction * 100}%` }} />
      </div>
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
