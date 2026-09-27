import { PanelsTopLeft } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import {
  resetLayoutAction,
  setWorkspaceAction,
  togglePanelAction,
} from '../../store/workspaceActions';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Menu, type MenuItem, Tabs } from '../../ui';
import { PANEL_IDS, findPanel } from '../../workspace/layout';
import { WORKSPACES } from '../../workspace/presets';
import { PANELS } from './panels';

const TABS = WORKSPACES.map((w) => ({
  id: w.id,
  label: w.label,
  title: `${w.title} (${w.hotkey})`,
}));

/**
 * Рабочие места и панели: вкладки наборов под задачу — как рабочие места Blender, — и меню, где
 * любую панель можно показать или скрыть, сбросить раскладку и открыть тему.
 */
export function WorkspaceBar() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const layout = useWorkspaceStore((s) => s.layouts[s.workspace]);
  const windows = useWorkspaceStore((s) => s.windows);
  const setThemeOpen = useUiStore((s) => s.setThemeOpen);
  const items: MenuItem[] = [
    ...PANEL_IDS.map((id) => {
      const detached = windows.includes(id);
      return {
        label: detached ? `${PANELS[id].title} — в отдельном окне` : PANELS[id].title,
        checked: detached || findPanel(layout, id) !== null,
        disabled: detached,
        onSelect: () => togglePanelAction(id),
      };
    }),
    { separator: true },
    { label: 'Сбросить раскладку', hotkey: 'Alt+0', onSelect: resetLayoutAction },
    { label: 'Тема оформления…', hotkey: 'Alt+T', onSelect: () => setThemeOpen(true) },
  ];
  return (
    <div className="workspace-bar">
      <Tabs
        value={workspace}
        onChange={setWorkspaceAction}
        items={TABS}
        ariaLabel="Рабочее место"
        className="workspace-tabs"
      />
      <Menu label="Панели: показать и скрыть, сбросить раскладку, тема" items={items} align="right">
        <PanelsTopLeft size={16} />
        Панели
      </Menu>
    </div>
  );
}
