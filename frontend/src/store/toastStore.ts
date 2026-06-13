import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  title?: string;
  message: string;
  /** ms; 0 = stay until manually dismissed */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (
    message: string,
    opts?: { kind?: ToastKind; title?: string; duration?: number },
  ) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, opts) => {
    const id = nextId++;
    const toast: Toast = {
      id,
      kind: opts?.kind ?? 'info',
      title: opts?.title,
      message,
      duration: opts?.duration ?? 4500,
    };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    if (toast.duration > 0) {
      setTimeout(() => get().dismiss(id), toast.duration);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Convenience helpers — `toast.error(...)`, `toast.success(...)`, etc. */
export const toast = {
  success: (message: string, opts?: { title?: string; duration?: number }) =>
    useToastStore.getState().push(message, { ...opts, kind: 'success' }),
  error: (message: string, opts?: { title?: string; duration?: number }) =>
    useToastStore.getState().push(message, { ...opts, kind: 'error' }),
  info: (message: string, opts?: { title?: string; duration?: number }) =>
    useToastStore.getState().push(message, { ...opts, kind: 'info' }),
  warning: (message: string, opts?: { title?: string; duration?: number }) =>
    useToastStore.getState().push(message, { ...opts, kind: 'warning' }),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
};
