import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';
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
 * Секция сайдбара с заголовком. Сворачивание запоминается, иначе на длинном сайдбаре
 * приходится сворачивать одно и то же после каждой перезагрузки.
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
  const [collapsed, setCollapsed] = useState(() =>
    id ? readSetting(`panel.${id}.collapsed`, defaultCollapsed) : defaultCollapsed,
  );

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
        {badge !== undefined && <span className="panel-badge">{badge}</span>}
        {actions !== undefined && <div className="panel-actions">{actions}</div>}
      </header>
      {!collapsed && <div className="panel-body">{children}</div>}
    </section>
  );
}
