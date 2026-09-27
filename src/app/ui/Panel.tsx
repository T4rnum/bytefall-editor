import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode, createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { readSetting, writeSetting } from './persist';

export interface PanelProps {
  readonly title: string;
  /** Приписка справа от заголовка: имя слоя, счётчик и подобное. */
  readonly badge?: ReactNode;
  /** Кнопки в правой части заголовка. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  /** Ключ для запоминания свёрнутого состояния между сессиями. */
  readonly id?: string;
  readonly collapsible?: boolean;
  readonly defaultCollapsed?: boolean;
  /** Панель тянется по высоте и прокручивает своё содержимое. */
  readonly grow?: boolean;
  readonly className?: string;
}

/**
 * Где стоит панель, если её держит рабочее место: заголовок, вкладки и сворачивание тогда у
 * группы, а панель выносит в `slot` — место в заголовке группы — только приписку и кнопки.
 */
export interface PanelHost {
  readonly slot: HTMLElement | null;
}

export const PanelHostContext = createContext<PanelHost | null>(null);

function HeaderExtras({ badge, actions }: Pick<PanelProps, 'badge' | 'actions'>) {
  return (
    <>
      {badge !== undefined && <span className="panel-badge">{badge}</span>}
      {actions !== undefined && <div className="panel-actions">{actions}</div>}
    </>
  );
}

/**
 * Секция с заголовком. Сама по себе сворачивается и запоминает это между сессиями; в рабочем
 * месте (`PanelHostContext`) отдаёт заголовок группе, где стоит.
 */
export function Panel({
  title,
  badge,
  actions,
  children,
  id,
  collapsible = true,
  defaultCollapsed = false,
  grow = false,
  className,
}: PanelProps) {
  const host = useContext(PanelHostContext);
  const [collapsed, setCollapsed] = useState(() =>
    id ? readSetting(`panel.${id}.collapsed`, defaultCollapsed) : defaultCollapsed,
  );

  if (host) {
    const extras = badge !== undefined || actions !== undefined;
    return (
      <section className={`panel panel--docked${className ? ` ${className}` : ''}`}>
        {extras &&
          host.slot &&
          createPortal(<HeaderExtras badge={badge} actions={actions} />, host.slot)}
        <div className="panel-body">{children}</div>
      </section>
    );
  }

  const toggle = (): void => {
    if (!collapsible) return;
    const next = !collapsed;
    setCollapsed(next);
    if (id) writeSetting(`panel.${id}.collapsed`, next);
  };

  const classes = [
    'panel',
    grow && !collapsed ? 'panel--grow' : '',
    collapsed ? 'is-collapsed' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes}>
      <header className="panel-header">
        {collapsible ? (
          <button
            type="button"
            className="panel-toggle"
            aria-expanded={!collapsed}
            title={collapsed ? 'Развернуть' : 'Свернуть'}
            onClick={toggle}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span>{title}</span>
          </button>
        ) : (
          <span className="panel-title">{title}</span>
        )}
        <HeaderExtras badge={badge} actions={actions} />
      </header>
      {!collapsed && <div className="panel-body">{children}</div>}
    </section>
  );
}
