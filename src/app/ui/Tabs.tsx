export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly title?: string;
}

export interface TabsProps<T extends string> {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly items: readonly TabItem<T>[];
  readonly ariaLabel?: string;
  readonly className?: string;
}

/** Переключатель режимов. Стрелки влево-вправо ходят по вкладкам, как того ждёт клавиатура. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
  className,
}: TabsProps<T>) {
  const move = (delta: number): void => {
    const index = items.findIndex((item) => item.id === value);
    if (index === -1) return;
    const next = items[(index + delta + items.length) % items.length];
    onChange(next.id);
  };

  return (
    <div
      className={`tabs${className ? ` ${className}` : ''}`}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        e.stopPropagation();
        move(e.key === 'ArrowRight' ? 1 : -1);
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          className={`tab${item.id === value ? ' is-active' : ''}`}
          aria-selected={item.id === value}
          tabIndex={item.id === value ? 0 : -1}
          title={item.title}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
