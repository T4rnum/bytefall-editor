import { create } from 'zustand';
import type { RgbaImage } from '../../core/quantize';

/** Картинка, которую сейчас настраивают в диалоге импорта. */
export interface ImageImportSource {
  readonly name: string;
  readonly image: RgbaImage;
}

interface UiState {
  readonly hotkeysOpen: boolean;
  readonly themeOpen: boolean;
  readonly errorsOpen: boolean;
  readonly resizeOpen: boolean;
  readonly exportOpen: boolean;
  /** Открыт ли диалог импорта и с какой картинкой. */
  readonly imageImport: ImageImportSource | null;
  /** Когда автосохранение последний раз легло на диск. null — ещё не писало или не может. */
  readonly autosavedAt: number | null;
  /** Автосохранение не смогло записать: хранилище браузера недоступно или переполнено. */
  readonly autosaveFailed: boolean;
  setHotkeysOpen: (open: boolean) => void;
  setThemeOpen: (open: boolean) => void;
  setErrorsOpen: (open: boolean) => void;
  setResizeOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setImageImport: (source: ImageImportSource | null) => void;
  setAutosaveStatus: (status: { at: number | null; failed: boolean }) => void;
}

/**
 * Состояние оболочки редактора: служебные окна. Отдельно от editorStore, потому что к документу
 * и к инструментам это отношения не имеет и в файл не сохраняется. Раскладка панелей — в
 * workspaceStore.
 */
export const useUiStore = create<UiState>((set) => ({
  hotkeysOpen: false,
  themeOpen: false,
  errorsOpen: false,
  resizeOpen: false,
  exportOpen: false,
  imageImport: null,
  autosavedAt: null,
  autosaveFailed: false,
  setHotkeysOpen: (hotkeysOpen) => set({ hotkeysOpen }),
  setThemeOpen: (themeOpen) => set({ themeOpen }),
  setErrorsOpen: (errorsOpen) => set({ errorsOpen }),
  setResizeOpen: (resizeOpen) => set({ resizeOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setImageImport: (imageImport) => set({ imageImport }),
  setAutosaveStatus: ({ at, failed }) => set({ autosavedAt: at, autosaveFailed: failed }),
}));
