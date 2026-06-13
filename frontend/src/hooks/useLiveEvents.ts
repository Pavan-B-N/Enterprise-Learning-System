/**
 * useLiveEvents - persistent WebSocket connection to the gateway.
 *
 * The gateway exposes /ws?token=<jwt>; on connect it subscribes to a Redis
 * channel scoped to the JWT's sub. Backend services publish to that channel
 * and we receive the events here in real time.
 *
 * Each frame is JSON: { event: string, data: any }.
 *
 * Usage:
 *   useLiveEvents((evt) => { if (evt.event === 'notification') {...} });
 */

import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';

export interface LiveEvent {
  event: string;
  data: any;
}

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

function wsUrl(token: string): string {
  // Gateway is hardcoded at localhost:8000 in api/client.ts; mirror that here.
  // In production this should come from a single VITE_API_URL but matches existing pattern.
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = (import.meta as any).env?.VITE_WS_HOST || 'localhost:8000';
  return `${proto}://${host}/ws?token=${encodeURIComponent(token)}`;
}

export function useLiveEvents(onEvent: (evt: LiveEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) return;

    let socket: WebSocket | null = null;
    let backoff = RECONNECT_DELAY_MS;
    let retryTimer: number | null = null;
    let alive = true;

    const connect = () => {
      if (!alive) return;
      try {
        socket = new WebSocket(wsUrl(token));
      } catch (err) {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        backoff = RECONNECT_DELAY_MS;
      };

      socket.onmessage = (msg) => {
        try {
          const parsed: LiveEvent = JSON.parse(msg.data);
          if (!parsed || typeof parsed.event !== 'string') return;
          if (parsed.event === 'ping') return;
          handlerRef.current(parsed);
        } catch {
          /* ignore */
        }
      };

      socket.onclose = () => {
        socket = null;
        scheduleReconnect();
      };
      socket.onerror = () => {
        try { socket?.close(); } catch {}
      };
    };

    const scheduleReconnect = () => {
      if (!alive) return;
      retryTimer = window.setTimeout(() => {
        backoff = Math.min(backoff * 2, MAX_RECONNECT_DELAY_MS);
        connect();
      }, backoff);
    };

    connect();

    return () => {
      alive = false;
      if (retryTimer) window.clearTimeout(retryTimer);
      try { socket?.close(); } catch {}
    };
  }, [token]);
}
