/**
 * Ephemeral interface state: toasts, the confirm dialog, the command palette and
 * the mobile menu. Kept apart from the business store so it never gets saved.
 */
import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

export interface ConfirmSpec {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'default' | 'danger';
  /** Optional word the person must type to proceed (for destructive actions). */
  requireText?: string;
}

interface UiState {
  toasts: ToastItem[];
  paletteOpen: boolean;
  menuOpen: boolean;
  notifOpen: boolean;
  confirm: (ConfirmSpec & { resolve: (ok: boolean) => void }) | null;
  setPalette(open: boolean): void;
  setMenu(open: boolean): void;
  setNotif(open: boolean): void;
  dropToast(id: number): void;
}

let toastSeq = 1;

export const useUi = create<UiState>((set) => ({
  toasts: [],
  paletteOpen: false,
  menuOpen: false,
  notifOpen: false,
  confirm: null,
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setMenu: (menuOpen) => set({ menuOpen }),
  setNotif: (notifOpen) => set({ notifOpen }),
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

function push(kind: ToastKind, title: string, body?: string) {
  const id = toastSeq++;
  // The same message twice in a row replaces the first one instead of stacking up.
  useUi.setState((s) => ({
    toasts: [...s.toasts.filter((x) => !(x.kind === kind && x.title === title && x.body === body)).slice(-3), { id, kind, title, body }],
  }));
  setTimeout(() => useUi.getState().dropToast(id), kind === 'error' ? 7000 : 4200);
}

export const toast = {
  success: (title: string, body?: string) => push('success', title, body),
  error: (title: string, body?: string) => push('error', title, body),
  info: (title: string, body?: string) => push('info', title, body),
};

/** Ask for confirmation inside the page (browsers' own dialogs are blocked in the demo frame). */
export function confirmDialog(spec: ConfirmSpec): Promise<boolean> {
  return new Promise((resolve) => {
    // A second request while one is open cancels the first.
    useUi.getState().confirm?.resolve(false);
    useUi.setState({
      confirm: {
        ...spec,
        resolve: (ok) => {
          useUi.setState({ confirm: null });
          resolve(ok);
        },
      },
    });
  });
}
