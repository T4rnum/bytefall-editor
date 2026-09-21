import { create } from 'zustand';
import { readSetting, writeSetting } from '../ui/persist';

const MIN_SIDEBAR = 220;
const MAX_SIDEBAR = 520;
const DEFAULT_SIDEBAR = 300;

interface UiState {
  /** Ширина правого сайдбара в пикселях. */
  readonly sidebarWidth: number;
  readonly hotkeysOpen: boolean;
  setSidebarWidth: (width: number) => void;
  setHotkeysOpen: (open: boolean) => void;
}

/**
 * Состояние оболочки редактора: раскладка и служебные окна. Отдельно от editorStore, потому что
 * к документу и к инструментам это отношения не имеет и в файл не сохраняется.
 */
export const useUiStore = create<UiState>((set) => ({
  sidebarWidth: Math.min(
    MAX_SIDEBAR,
    Math.max(MIN_SIDEBAR, readSetting('sidebarWidth', DEFAULT_SIDEBAR)),
  ),
  hotkeysOpen: false,
  setSidebarWidth: (width) => {
    const clamped = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, Math.round(width)));
    writeSetting('sidebarWidth', clamped);
    set({ sidebarWidth: clamped });
  },
  setHotkeysOpen: (hotkeysOpen) => set({ hotkeysOpen }),
}));

export const SIDEBAR_LIMITS = { min: MIN_SIDEBAR, max: MAX_SIDEBAR } as const;
