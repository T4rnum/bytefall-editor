import { useUiStore } from '../store/uiStore';
import { resetLayoutAction, setWorkspaceAction } from '../store/workspaceActions';
import { WORKSPACES } from '../workspace/presets';
import type { Hotkey } from './types';

/** Рабочие места: набор панелей под задачу одним нажатием, как вкладки рабочих мест Blender. */
export const WORKSPACE_HOTKEYS: readonly Hotkey[] = [
  ...WORKSPACES.map((w): Hotkey => ({
    group: 'Рабочее место',
    label: `Рабочее место «${w.label}»`,
    keys: w.hotkey,
    run: () => setWorkspaceAction(w.id),
  })),
  {
    group: 'Рабочее место',
    label: 'Сбросить раскладку рабочего места',
    keys: 'Alt+0',
    run: resetLayoutAction,
  },
  {
    group: 'Рабочее место',
    label: 'Тема оформления',
    keys: 'Alt+T',
    run: () => useUiStore.getState().setThemeOpen(true),
  },
];
