import { Check } from 'lucide-react';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, type ControlSize } from './Button';
import { placeMenu } from './popover';

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
 * меню открыто: панель может жить в отдельном окне браузера. Список встаёт поверх всего, по
 * координатам окна: колонка рабочего места обрезала бы его по своему краю.
 */
export function Menu({ children, label, items, icon, size, align = 'left', className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Место считается до первой отрисовки: список не мелькает там, где не поместится.
  useLayoutEffect(() => {
    const anchor = root.current;
    const el = list.current;
    const view = anchor?.ownerDocument.defaultView;
    if (!open || !anchor || !el || !view) return;
    const place = placeMenu(
      anchor.getBoundingClientRect(),
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: view.innerWidth, height: view.innerHeight },
      align,
    );
    el.style.left = `${place.left}px`;
    el.style.top = `${place.top}px`;
    el.style.visibility = 'visible';
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const view = root.current?.ownerDocument.defaultView;
    if (!view) return;
    const close = (): void => setOpen(false);
    const onDown = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    // Список стоит по координатам окна: прокрутка колонки под ним или новый размер окна
    // оставили бы его висеть в стороне от кнопки.
    const onScroll = (event: Event): void => {
      if (!list.current?.contains(event.target as Node)) close();
    };
    view.addEventListener('pointerdown', onDown, true);
    view.addEventListener('keydown', onKey, true);
    view.addEventListener('scroll', onScroll, true);
    view.addEventListener('resize', close);
    return () => {
      view.removeEventListener('pointerdown', onDown, true);
      view.removeEventListener('keydown', onKey, true);
      view.removeEventListener('scroll', onScroll, true);
      view.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div className={`menu${className ? ` ${className}` : ''}`} ref={root}>
      <Button icon={icon} size={size} label={label} active={open} onClick={() => setOpen(!open)}>
        {children}
      </Button>
      {open && (
        <div ref={list} className="menu-list" role="menu">
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
