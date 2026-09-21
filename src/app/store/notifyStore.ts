import { create } from 'zustand';

export type NoticeKind = 'info' | 'error';

interface NotifyState {
  readonly message: string | null;
  readonly kind: NoticeKind;
  notify: (message: string, kind?: NoticeKind) => void;
  clear: () => void;
}

const AUTO_CLEAR_MS = 4000;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useNotifyStore = create<NotifyState>((set) => ({
  message: null,
  kind: 'info',
  notify: (message, kind = 'info') => {
    if (timer) clearTimeout(timer);
    set({ message, kind });
    timer = setTimeout(
      () => set({ message: null }),
      kind === 'error' ? AUTO_CLEAR_MS * 2 : AUTO_CLEAR_MS,
    );
  },
  clear: () => set({ message: null }),
}));

export const notify = (message: string, kind: NoticeKind = 'info'): void =>
  useNotifyStore.getState().notify(message, kind);

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
