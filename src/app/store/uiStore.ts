import { create } from 'zustand';
import type { RgbaImage } from '../../core/quantize';
import { readSetting, writeSetting } from '../ui/persist';

/** Картинка, которую сейчас настраивают в диалоге импорта. */
export interface ImageImportSource {
  readonly name: string;
  readonly image: RgbaImage;
}

const MIN_SIDEBAR = 220;
const MAX_SIDEBAR = 520;
const DEFAULT_SIDEBAR = 300;

interface UiState {
  /** Ширина правого сайдбара в пикселях. */
  readonly sidebarWidth: number;
  readonly hotkeysOpen: boolean;
  readonly resizeOpen: boolean;
  /** Открыт ли диалог импорта и с какой картинкой. */
  readonly imageImport: ImageImportSource | null;
  /** Когда автосохранение последний раз легло на диск. null — ещё не писало или не может. */
  readonly autosavedAt: number | null;
  /** Автосохранение не смогло записать: хранилище браузера недоступно или переполнено. */
  readonly autosaveFailed: boolean;
  setSidebarWidth: (width: number) => void;
  setHotkeysOpen: (open: boolean) => void;
  setResizeOpen: (open: boolean) => void;
  setImageImport: (source: ImageImportSource | null) => void;
  setAutosaveStatus: (status: { at: number | null; failed: boolean }) => void;
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
  resizeOpen: false,
  imageImport: null,
  autosavedAt: null,
  autosaveFailed: false,
  setSidebarWidth: (width) => {
    const clamped = Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, Math.round(width)));
    writeSetting('sidebarWidth', clamped);
    set({ sidebarWidth: clamped });
  },
  setHotkeysOpen: (hotkeysOpen) => set({ hotkeysOpen }),
  setResizeOpen: (resizeOpen) => set({ resizeOpen }),
  setImageImport: (imageImport) => set({ imageImport }),
  setAutosaveStatus: ({ at, failed }) => set({ autosavedAt: at, autosaveFailed: failed }),
}));

export const SIDEBAR_LIMITS = { min: MIN_SIDEBAR, max: MAX_SIDEBAR } as const;
