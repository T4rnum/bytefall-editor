import { create } from 'zustand';
import { readSetting, writeSetting } from '../ui/persist';
import type { Box } from '../workspace/dropTarget';
import { type DropTarget, type Layout, type PanelId, restoreLayout } from '../workspace/layout';
import { PRESETS, WORKSPACES, type WorkspaceId, isWorkspaceId } from '../workspace/presets';
import { type Theme, restoreTheme } from '../workspace/theme';

/**
 * Рабочее место: какой набор открыт, раскладка каждого набора, панели в отдельных окнах, тема.
 * Всё это — настройки вида этого пользователя в этом браузере, в документ не попадает.
 */
interface WorkspaceState {
  readonly workspace: WorkspaceId;
  readonly layouts: Readonly<Record<WorkspaceId, Layout>>;
  /** Панели в отдельных окнах: в зонах их не рисуют ни в одном наборе. */
  readonly windows: readonly PanelId[];
  /** Куда панель вернётся, когда её окно закроют. */
  readonly returns: Readonly<Partial<Record<PanelId, DropTarget>>>;
  /** Панель, которую сейчас тащат: пустые зоны показывают полосу, куда её можно бросить. */
  readonly dragging: PanelId | null;
  /** Куда упадёт панель, если отпустить сейчас: подсветка места вставки. */
  readonly dropBox: Box | null;
  readonly theme: Theme;
  setWorkspace: (id: WorkspaceId) => void;
  editLayout: (fn: (layout: Layout) => Layout) => void;
  resetLayout: () => void;
  setDragging: (id: PanelId | null) => void;
  setDropBox: (box: Box | null) => void;
  openWindow: (id: PanelId, back: DropTarget) => void;
  closeWindow: (id: PanelId) => DropTarget | undefined;
  setTheme: (theme: Theme) => void;
}

const layoutKey = (id: WorkspaceId): string => `workspace.layout.${id}`;

function loadLayouts(): Record<WorkspaceId, Layout> {
  const out = {} as Record<WorkspaceId, Layout>;
  for (const { id } of WORKSPACES) {
    out[id] = restoreLayout(readSetting<unknown>(layoutKey(id), null), PRESETS[id]);
  }
  return out;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: ((): WorkspaceId => {
    const saved = readSetting<unknown>('workspace.active', 'draw');
    return isWorkspaceId(saved) ? saved : 'draw';
  })(),
  layouts: loadLayouts(),
  windows: [],
  returns: {},
  dragging: null,
  dropBox: null,
  theme: restoreTheme(readSetting<unknown>('theme', null)),
  setWorkspace: (workspace) => {
    writeSetting('workspace.active', workspace);
    set({ workspace });
  },
  editLayout: (fn) => {
    const { workspace, layouts } = get();
    const next = fn(layouts[workspace]);
    if (next === layouts[workspace]) return;
    writeSetting(layoutKey(workspace), next);
    set({ layouts: { ...layouts, [workspace]: next } });
  },
  resetLayout: () => get().editLayout(() => PRESETS[get().workspace]),
  setDragging: (dragging) => set({ dragging, dropBox: null }),
  setDropBox: (dropBox) => set({ dropBox }),
  openWindow: (id, back) =>
    set((s) =>
      s.windows.includes(id)
        ? s
        : { windows: [...s.windows, id], returns: { ...s.returns, [id]: back } },
    ),
  closeWindow: (id) => {
    const back = get().returns[id];
    set((s) => {
      const returns = { ...s.returns };
      delete returns[id];
      return { windows: s.windows.filter((w) => w !== id), returns };
    });
    return back;
  },
  setTheme: (theme) => {
    writeSetting('theme', theme);
    set({ theme });
  },
}));

export const currentLayout = (): Layout => {
  const { layouts, workspace } = useWorkspaceStore.getState();
  return layouts[workspace];
};
