import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { GlyphAtlas } from '../../../render/font/GlyphAtlas';
import { hidePanelAction, openPanelWindowAction } from '../../store/workspaceActions';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Menu, PanelHostContext, TIP_ATTR } from '../../ui';
import {
  type PanelGroup,
  type PanelId,
  type ZoneId,
  activatePanel,
  toggleCollapsed,
} from '../../workspace/layout';
import { PANELS } from './panels';
import { pressPanelTab } from './panelDrag';

const ZONE_NAMES: Readonly<Record<ZoneId, string>> = {
  left: 'Левая колонка',
  right: 'Правая колонка',
  bottom: 'Нижняя полоса',
};

function PanelMenu({ id }: { readonly id: PanelId }) {
  return (
    <Menu
      icon
      size="sm"
      align="right"
      label={`Панель «${PANELS[id].title}»`}
      className="dock-menu"
      items={[
        { label: 'В отдельное окно', onSelect: () => openPanelWindowAction(id, PANELS[id].title) },
        { label: 'Скрыть панель', onSelect: () => hidePanelAction(id) },
      ]}
    >
      <MoreHorizontal size={14} />
    </Menu>
  );
}

interface GroupProps {
  readonly zone: ZoneId;
  /** Номер группы в раскладке: по нему считаются места вставки. */
  readonly index: number;
  readonly group: PanelGroup;
  readonly atlas: GlyphAtlas;
}

/**
 * Группа панелей: вкладки в заголовке, видна активная. Вкладку тянут в другое место, щелчок
 * делает её активной. В заголовок активная панель выносит свою приписку и кнопки.
 */
function DockGroup({ zone, index, group, atlas }: GroupProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const edit = useWorkspaceStore((s) => s.editLayout);
  const spec = PANELS[group.active];
  const foldable = zone !== 'bottom';
  const classes = [
    'dock-group',
    group.collapsed ? 'is-collapsed' : '',
    spec.grow && !group.collapsed ? 'dock-group--grow' : '',
  ].join(' ');
  return (
    <section className={classes} data-dock-group data-zone={zone} data-index={index}>
      <header className="dock-header">
        {foldable && (
          <button
            type="button"
            className="dock-fold"
            aria-expanded={!group.collapsed}
            {...{ [TIP_ATTR]: group.collapsed ? 'Развернуть' : 'Свернуть' }}
            onClick={() => edit((l) => toggleCollapsed(l, zone, index))}
          >
            {group.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        <div className="dock-tabs" role="tablist">
          {group.panels.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === group.active}
              className={`dock-tab${id === group.active ? ' is-active' : ''}`}
              {...{ [TIP_ATTR]: `${PANELS[id].hint}. Перетащите, чтобы переставить` }}
              onPointerDown={(e) => pressPanelTab(e, id, () => edit((l) => activatePanel(l, id)))}
            >
              {PANELS[id].title}
            </button>
          ))}
        </div>
        <PanelMenu id={group.active} />
        <span className="dock-slot" ref={setSlot} />
      </header>
      {!group.collapsed && (
        <div className="dock-body">
          <PanelHostContext.Provider value={{ slot }}>
            {spec.render(atlas)}
          </PanelHostContext.Provider>
        </div>
      )}
    </section>
  );
}

/**
 * Зона рабочего места: колонка или нижняя полоса. Пустая зона не занимает места, но пока тянут
 * панель — показывает полосу, куда её можно бросить.
 */
export function DockZone({ zone, atlas }: { readonly zone: ZoneId; readonly atlas: GlyphAtlas }) {
  const layout = useWorkspaceStore((s) => s.layouts[s.workspace]);
  const windows = useWorkspaceStore((s) => s.windows);
  const dragging = useWorkspaceStore((s) => s.dragging);
  const { groups, size } = layout.zones[zone];
  // Панели в отдельных окнах в зонах не рисуются: группа без них показывает, что осталось.
  const shown = groups
    .map((group, index) => {
      const panels = group.panels.filter((p) => !windows.includes(p));
      const active = panels.includes(group.active) ? group.active : panels[0];
      return { index, group: { ...group, panels, active } };
    })
    .filter(({ group }) => group.panels.length > 0);
  if (shown.length === 0 && !dragging) return null;
  const style =
    zone === 'bottom' ? { height: size } : { width: shown.length > 0 ? size : undefined };
  return (
    <div
      className={`dock dock--${zone}${shown.length === 0 ? ' dock--empty' : ''}`}
      data-dock-zone={zone}
      data-groups={groups.length}
      style={style}
      aria-label={ZONE_NAMES[zone]}
    >
      {shown.length === 0 ? (
        <span className="dock-drop-hint">{ZONE_NAMES[zone]}</span>
      ) : (
        shown.map(({ index, group }) => (
          <DockGroup key={index} zone={zone} index={index} group={group} atlas={atlas} />
        ))
      )}
    </div>
  );
}

/** Есть ли в зоне что показать: у пустой зоны нет и полосы для изменения размера. */
export const useZoneShown = (zone: ZoneId): boolean =>
  useWorkspaceStore((s) =>
    s.layouts[s.workspace].zones[zone].groups.some((g) =>
      g.panels.some((p) => !s.windows.includes(p)),
    ),
  );

/** Подсветка места, куда упадёт панель. */
export function DropIndicator() {
  const box = useWorkspaceStore((s) => s.dropBox);
  if (!box) return null;
  return (
    <div
      className="dock-drop"
      aria-hidden="true"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    />
  );
}
