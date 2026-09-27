import { Check } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button, type ControlSize } from './Button';

export type MenuItem =
  | {
      readonly label: string;
      readonly onSelect: () => void;
      /** Флажок слева: пункт что-то включает и выключает. */
      readonly checked?: boolean;
      readonly hotkey?: string;
      readonly disabled?: boolean;
    }
  | { readonly separator: true };

export interface MenuProps {
  /** Содержимое кнопки, открывающей меню. */
  readonly children: ReactNode;
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly icon?: boolean;
  readonly size?: ControlSize;
  /** С какого края кнопки выравнивать список. */
  readonly align?: 'left' | 'right';
  readonly className?: string;
}

/**
 * Кнопка со списком действий. Закрывается выбором, Escape и щелчком мимо — в том окне, где
 * меню открыто: панель может жить в отдельном окне браузера.
 */
export function Menu({ children, label, items, icon, size, align = 'left', className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const view = root.current?.ownerDocument.defaultView;
    if (!view) return;
    const onDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    view.addEventListener('pointerdown', onDown, true);
    view.addEventListener('keydown', onKey, true);
    return () => {
      view.removeEventListener('pointerdown', onDown, true);
      view.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className={`menu${className ? ` ${className}` : ''}`} ref={root}>
      <Button icon={icon} size={size} label={label} active={open} onClick={() => setOpen(!open)}>
        {children}
      </Button>
      {open && (
        <div className={`menu-list menu-list--${align}`} role="menu">
          {items.map((item, i) =>
            'separator' in item ? (
              <div key={`sep-${i}`} className="menu-separator" role="separator" />
            ) : (
              <button
                key={item.label}
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={item.checked}
                className="menu-item"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <span className="menu-check" aria-hidden="true">
                  {item.checked && <Check size={12} />}
                </span>
                <span className="menu-label">{item.label}</span>
                {item.hotkey && <kbd className="menu-hotkey">{item.hotkey}</kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
