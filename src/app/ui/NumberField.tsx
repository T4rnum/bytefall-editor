import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type DragMode,
  type NumericRange,
  dragModeOf,
  formatNumber,
  parseNumber,
  valueFromDrag,
  valueFromNudge,
} from './numeric';

/** Дальше этого сдвига жест считается перетаскиванием, а не щелчком по полю. */
const CLICK_SLOP = 3;

export interface NumberFieldProps {
  readonly value: number;
  /** Вызывается непрерывно во время перетаскивания: годится для живого показа. */
  readonly onChange: (value: number) => void;
  /**
   * Вызывается один раз в конце жеста. Нужен там, где каждое промежуточное значение не должно
   * попадать в историю. Если не задан, фиксацией считается onChange.
   */
  readonly onCommit?: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Подпись внутри поля, слева от числа. */
  readonly label?: string;
  /** Единица измерения справа от числа. */
  readonly suffix?: string;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly className?: string;
  /** Ширина поля; по умолчанию берётся из токена --field-w. */
  readonly width?: string;
}

interface DragState {
  readonly pointerId: number;
  startX: number;
  startY: number;
  startValue: number;
  mode: DragMode;
  moved: boolean;
  /** Последнее выданное значение: от него отсчитывается новая база при смене модификатора. */
  lastValue: number;
}

/**
 * Числовое поле в стиле Blender: тянешь — меняется, щёлкаешь — редактируешь вручную.
 * Shift держит мелкий шаг, Ctrl крупный. Колесо и стрелки шагают на один шаг.
 *
 * Вся арифметика лежит в numeric.ts и покрыта тестами; здесь только работа с указателем.
 */
export function NumberField({
  value,
  onChange,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  label,
  suffix,
  disabled = false,
  title,
  className,
  width,
}: NumberFieldProps) {
  const range: NumericRange = useMemo(() => ({ min, max, step }), [min, max, step]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const drag = useRef<DragState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const emit = useCallback(
    (next: number): void => {
      if (next !== value) onChange(next);
    },
    [onChange, value],
  );

  /** Конец жеста: сюда попадает значение, которое должно уйти в историю. */
  const commit = useCallback(
    (next: number): void => {
      emit(next);
      onCommit?.(next);
    },
    [emit, onCommit],
  );

  const startEditing = useCallback((): void => {
    setDraft(formatNumber(value, range));
    setEditing(true);
  }, [value, range]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (disabled || editing || event.button !== 0) return;
    event.preventDefault();
    // Захват может не сработать, например если указатель уже отпущен: жест должен пережить это.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* без захвата жест просто оборвётся на границе элемента */
    }
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue: value,
      mode: dragModeOf(event),
      moved: false,
      lastValue: value,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;

    // Модификатор можно зажать и отпустить посреди жеста. Тогда отсчёт начинается заново от
    // текущего значения и текущей точки, иначе значение скакнуло бы при смене шага.
    const mode = dragModeOf(event);
    if (mode !== state.mode) {
      state.mode = mode;
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.startValue = state.lastValue;
      return;
    }

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.abs(dx) + Math.abs(dy) <= CLICK_SLOP) return;
    state.moved = true;
    state.lastValue = valueFromDrag(state.startValue, dx, dy, range, state.mode);
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
    // Щелчок без протаскивания — это намерение ввести значение руками.
    if (state.moved) {
      commit(state.lastValue);
    } else {
      startEditing();
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    if (disabled || editing) return;
    commit(valueFromNudge(value, -event.deltaY, range, dragModeOf(event)));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      // Гасим событие, иначе стрелку получит ещё и активный инструмент.
      event.preventDefault();
      event.stopPropagation();
      commit(valueFromNudge(value, event.key === 'ArrowUp' ? 1 : -1, range, dragModeOf(event)));
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      startEditing();
    }
  };

  if (editing) {
    return (
      <NumberFieldInput
        draft={draft}
        setDraft={setDraft}
        onCommit={(text) => {
          commit(parseNumber(text, value, range));
          setEditing(false);
          rootRef.current?.focus();
        }}
        onCancel={() => {
          setEditing(false);
          rootRef.current?.focus();
        }}
        width={width}
        className={className}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className={`numfield${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
      style={width ? { width } : undefined}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={Number.isFinite(min) ? min : undefined}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      aria-disabled={disabled || undefined}
      title={title ?? 'Тяни, чтобы менять. Щелчок — ввод. Shift точнее, Ctrl крупнее'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
    >
      {label !== undefined && <span className="numfield-label">{label}</span>}
      <span className="numfield-value">
        {formatNumber(value, range)}
        {suffix}
      </span>
    </div>
  );
}

interface InputProps {
  readonly draft: string;
  readonly setDraft: (text: string) => void;
  readonly onCommit: (text: string) => void;
  readonly onCancel: () => void;
  readonly width?: string;
  readonly className?: string;
}

/** Режим ручного ввода. Отдельный компонент, чтобы автофокус срабатывал на монтировании. */
function NumberFieldInput({ draft, setDraft, onCommit, onCancel, width, className }: InputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      autoFocus
      className={`numfield numfield--editing${className ? ` ${className}` : ''}`}
      style={width ? { width } : undefined}
      value={draft}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        // Гасим, чтобы глобальные горячие клавиши не сработали поверх ввода.
        e.stopPropagation();
        if (e.key === 'Enter') onCommit(e.currentTarget.value);
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}
