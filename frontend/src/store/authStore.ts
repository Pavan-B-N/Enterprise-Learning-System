import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '../api/client';

interface User {
  id: string;
  email: string;
  role: string;
  roles?: string[];
  full_name: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  setAuth: (token: string, refreshToken: string, user: User) => void;
  setActiveRole: (role: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      login: async (email: string, password: string) => {
        const res = await apiClient.post('/api/auth/login', { email, password });
        const { access_token, refresh_token, user } = res.data;
        set({ token: access_token, refreshToken: refresh_token, user });
      },
      setAuth: (token, refreshToken, user) => set({ token, refreshToken, user }),
      setActiveRole: (role) =>
        set((state) => {
          if (!state.user) return state;
          const allowed = state.user.roles ?? [state.user.role];
          if (!allowed.includes(role)) return state;
          return { user: { ...state.user, role } };
        }),
      logout: () => set({ token: null, refreshToken: null, user: null }),
    }),
    { name: 'auth-storage' },
  ),
);
