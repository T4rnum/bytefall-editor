import { useRef } from 'react';

export interface ResizerProps {
  /** Значение на момент начала жеста. */
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly direction?: 'vertical' | 'horizontal';
  /** Знак смещения: −1, когда область растёт при движении указателя влево или вверх. */
  readonly sign?: 1 | -1;
  readonly ariaLabel: string;
}

/**
 * Полоса перетаскивания между областями. Работает через захват указателя, поэтому жест
 * не теряется, если курсор уедет за пределы полосы.
 */
export function Resizer({
  value,
  onChange,
  direction = 'vertical',
  sign = 1,
  ariaLabel,
}: ResizerProps) {
  const start = useRef<{ pointer: number; origin: number; value: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const axis = (event: React.PointerEvent): number =>
    direction === 'vertical' ? event.clientX : event.clientY;

  return (
    <div
      ref={ref}
      className={`resizer resizer--${direction === 'vertical' ? 'v' : 'h'}`}
      role="separator"
      aria-label={ariaLabel}
      aria-orientation={direction}
      tabIndex={0}
      onPointerDown={(e) => {
        // preventDefault подавляет и установку фокуса, поэтому фокусируем вручную:
        // иначе стрелками подвинуть разделитель можно было бы только после Tab.
        e.preventDefault();
        e.currentTarget.focus();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* без захвата жест оборвётся на границе полосы */
        }
        e.currentTarget.classList.add('is-active');
        start.current = { pointer: e.pointerId, origin: axis(e), value };
      }}
      onPointerMove={(e) => {
        const state = start.current;
        if (!state || state.pointer !== e.pointerId) return;
        onChange(state.value + (axis(e) - state.origin) * sign);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        start.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* захвата не было */
        }
        e.currentTarget.classList.remove('is-active');
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 50 : 10;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          onChange(value - step * sign);
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(value + step * sign);
        }
      }}
    />
  );
}
