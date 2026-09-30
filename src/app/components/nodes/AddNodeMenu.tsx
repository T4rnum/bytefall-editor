import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type NodeMenuItem, type NodePick, nodeMenuItems } from '../../nodes/nodeMenu';
import type { Point } from '../../nodes/nodeLayout';
import { SearchField } from '../../ui';
import { clampInto } from '../../ui/popover';

export interface AddNodeMenuProps {
  /** Где открылось меню, в пикселях от угла редактора. */
  readonly at: Point;
  readonly onPick: (pick: NodePick) => void;
  readonly onClose: () => void;
}

/** Пункты подряд, с подписью группы перед первым пунктом каждой. */
function groupsOf(items: readonly NodeMenuItem[]): { group: string; items: NodeMenuItem[] }[] {
  const out: { group: string; items: NodeMenuItem[] }[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last?.group === item.group) last.items.push(item);
    else out.push({ group: item.group, items: [item] });
  }
  return out;
}

/**
 * Меню «Добавить» (Shift+A): узлы словаря по группам и готовые сборки. Печатать можно сразу:
 * поле поиска забирает фокус, Enter берёт первый найденный, Escape и щелчок мимо закрывают.
 */
export function AddNodeMenu({ at, onPick, onClose }: AddNodeMenuProps) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const items = nodeMenuItems(query);

  // Открытое у края поля меню сдвигается внутрь: край редактора обрезал бы его.
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const place = clampInto(
      { left: at.x, top: at.y },
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: box.clientWidth, height: box.clientHeight },
    );
    el.style.left = `${place.left}px`;
    el.style.top = `${place.top}px`;
  }, [at, items.length]);

  // Щелчок мимо слушается в окне самого меню: редактор может жить в отдельном окне.
  useEffect(() => {
    const view = ref.current?.ownerDocument.defaultView;
    if (!view) return;
    const onDown = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    view.addEventListener('pointerdown', onDown, true);
    return () => view.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="node-menu"
      style={{ left: at.x, top: at.y }}
      role="menu"
      aria-label="Добавить узел"
    >
      <SearchField
        value={query}
        onChange={setQuery}
        onSubmit={() => items[0] && onPick(items[0].pick)}
        onCancel={onClose}
        placeholder="Найти узел"
        ariaLabel="Найти узел"
        size="sm"
        autoFocus
      />
      <div className="node-menu-list">
        {items.length === 0 && <p className="node-menu-empty">Такого узла нет</p>}
        {groupsOf(items).map(({ group, items: list }) => (
          <div key={group} className="node-menu-group">
            <div className="node-menu-heading">{group}</div>
            {list.map((item) => (
              <button
                key={`${group}:${item.label}`}
                type="button"
                role="menuitem"
                className="node-menu-item"
                title={item.hint}
                onClick={() => onPick(item.pick)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
