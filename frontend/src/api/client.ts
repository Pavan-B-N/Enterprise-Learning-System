import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: 'http://localhost:8000',
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Endpoints that handle their own auth errors locally (login, refresh, etc.).
// A 401 here is "wrong password" — never trigger a global logout/redirect.
const AUTH_ENDPOINT_PREFIXES = ['/api/auth/', '/auth/'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url: string = error.config?.url || '';
    const isAuthCall = AUTH_ENDPOINT_PREFIXES.some((p) => url.startsWith(p));

    if (error.response?.status === 401 && !isAuthCall) {
      // Real session expiry on a protected call → clear auth and bounce to login.
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;

