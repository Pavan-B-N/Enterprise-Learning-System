import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Radio, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const LEVEL_COLORS: Record<string, string> = {
  info: '#22c55e', warn: '#f59e0b', error: '#ef4444', debug: '#6b7280',
};
const MAX_LOGS = 200;
const SERVICES = ['', 'gateway', 'core', 'orchestrator', 'admin', 'assessment'];
const LEVELS = ['', 'info', 'warn', 'error', 'debug'];

export default function LiveLogStream() {
  const token = useAuthStore((s) => s.token);
  const [logs, setLogs] = useState<any[]>([]);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const [filters, setFilters] = useState({ service: '', level: '' });
  const pausedRef = useRef(paused);
  const logsRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // SSE doesn't support custom headers, so we stream via fetch + ReadableStream
  // and parse the SSE frames manually. This lets us send the JWT.
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    let buf = '';

    (async () => {
      try {
        const res = await fetch('http://localhost:8000/api/admin/telemetry/logs/stream', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          setConnected(false);
          return;
        }
        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = frame.split('\n').find((ln) => ln.startsWith('data:'));
            if (!dataLine) continue;
            try {
              const entry = JSON.parse(dataLine.slice(5).trim());
              if (pausedRef.current) continue;
              setLogs((prev) => {
                const next = [entry, ...prev];
                return next.length > MAX_LOGS ? next.slice(0, MAX_LOGS) : next;
              });
            } catch { /* ignore parse errors / heartbeats */ }
          }
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') setConnected(false);
      } finally {
        setConnected(false);
      }
    })();

    return () => { controller.abort(); esRef.current?.close(); };
  }, [token]);

  const filtered = logs.filter((l) =>
    (!filters.service || l.service === filters.service) &&
    (!filters.level || l.level === filters.level)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 1300 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <Radio size={18} color={connected ? '#22c55e' : '#ef4444'} /> Live Log Stream
            <span style={{ fontSize: '.7rem', padding: '.15rem .55rem', borderRadius: 999, background: connected ? '#22c55e1a' : '#ef44441a', color: connected ? '#22c55e' : '#ef4444' }}>
              {connected ? 'connected' : 'disconnected'}
            </span>
          </h2>
          <p style={{ margin: '.25rem 0 0', color: 'var(--text-muted)', fontSize: '.85rem' }}>
            Real-time log feed via Server-Sent Events. Buffer capped at {MAX_LOGS} entries.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button onClick={() => setPaused((p) => !p)} style={btn}>
            {paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}
          </button>
          <button onClick={() => setLogs([])} style={btn}><Trash2 size={14} /> Clear</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '.5rem' }}>
        <select value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })} style={input}>
          {SERVICES.map((s) => <option key={s} value={s}>{s ? `service: ${s}` : 'all services'}</option>)}
        </select>
        <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })} style={input}>
          {LEVELS.map((l) => <option key={l} value={l}>{l ? `level: ${l}` : 'all levels'}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '.78rem', alignSelf: 'center' }}>
          {filtered.length} / {logs.length} shown
        </span>
      </div>

      <div ref={logsRef} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        height: '60vh', overflow: 'auto', fontFamily: 'monospace', fontSize: '.78rem',
      }}>
        {filtered.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            {paused ? 'Stream paused.' : 'Waiting for log events…'}
          </div>
        )}
        {filtered.map((l, i) => (
          <div key={`${l._id || ''}_${i}`} style={{
            display: 'grid', gridTemplateColumns: '110px 100px 50px 1fr 90px',
            gap: '.6rem', padding: '.35rem .75rem', borderBottom: '1px solid var(--border)',
            background: l.level === 'error' ? '#ef44440d' : 'transparent',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>{(l.timestamp || '').slice(11, 23)}</span>
            <span>{l.service}</span>
            <span style={{ color: LEVEL_COLORS[l.level] || '#9ca3af', fontWeight: 600, textTransform: 'uppercase', fontSize: '.7rem' }}>{l.level}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message}</span>
            <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
              {l.raid ? l.raid.slice(0, 8) : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, padding: '.45rem .65rem',
  background: 'var(--bg-input)', fontSize: '.82rem', outline: 'none',
};

const btn: React.CSSProperties = {
  background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '.5rem .85rem', fontSize: '.82rem', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: '.4rem',
};
