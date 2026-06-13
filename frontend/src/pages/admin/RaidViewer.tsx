import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertCircle, ChevronRight, Clock, Search, Server, RefreshCw } from 'lucide-react';
import apiClient from '../../api/client';

const SERVICE_COLORS: Record<string, string> = {
  gateway: '#6366f1',
  core: '#0ea5e9',
  orchestrator: '#a855f7',
  admin: '#f59e0b',
  assessment: '#22c55e',
};

const LEVEL_COLORS: Record<string, string> = {
  info: '#22c55e',
  warn: '#f59e0b',
  error: '#ef4444',
  debug: '#6b7280',
};

export default function RaidViewer() {
  const [params, setParams] = useSearchParams();
  const initialRaid = params.get('raid') || '';
  const [raid, setRaid] = useState(initialRaid);
  const [trace, setTrace] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const nav = useNavigate();

  const loadStats = async () => {
    try {
      const res = await apiClient.get('/api/admin/telemetry/logs/log-stats?hours=24');
      setStats(res.data);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { loadStats(); }, []);
  useEffect(() => {
    if (initialRaid) doLookup(initialRaid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRaid]);

  const doLookup = async (id: string) => {
    setLoading(true); setError(''); setTrace(null);
    try {
      const res = await apiClient.get(`/api/admin/telemetry/logs/raid/${id}`);
      setTrace(res.data);
      if (res.data?.summary?.total_logs === 0) setError('No logs found for this RAID');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load trace');
    } finally {
      setLoading(false);
    }
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!raid.trim()) return;
    setParams({ raid: raid.trim() });
    doLookup(raid.trim());
  };

  const onPickRecent = (id: string) => {
    setRaid(id);
    setParams({ raid: id });
    doLookup(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 1200 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <Activity size={20} /> RAID Trace Viewer
        </h2>
        <p style={{ margin: '.25rem 0 0', color: 'var(--text-muted)', fontSize: '.85rem' }}>
          End-to-end request trace across gateway → core → orchestrator → admin services.
        </p>
      </div>

      {/* Stats strip */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '.75rem' }}>
          <StatCard label="Logs (24h)" value={stats.total_logs} />
          <StatCard label="Errors (24h)" value={stats.error_count} accent={stats.error_count > 0 ? '#ef4444' : undefined} />
          <StatCard label="Error Rate" value={stats.error_rate} />
          <StatCard label="Live SSE Clients" value={stats.sse_clients ?? 0} />
        </div>
      )}

      {/* Search bar */}
      <form onSubmit={onSearch} style={{ display: 'flex', gap: '.5rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={raid}
            onChange={(e) => setRaid(e.target.value)}
            placeholder="Paste a RAID (e.g. 550e8400-e29b-41d4-a716-446655440000)"
            style={{
              width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '.6rem .75rem .6rem 2rem',
              background: 'var(--bg-input)', fontFamily: 'monospace', fontSize: '.85rem', outline: 'none',
            }}
          />
        </div>
        <button type="submit" disabled={loading} style={btnPrimary}>
          {loading ? 'Loading…' : 'Trace'}
        </button>
        <button type="button" onClick={() => { loadStats(); if (raid) doLookup(raid); }} style={btnGhost} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </form>

      {/* Recent RAIDs */}
      {stats?.recent_raids?.length > 0 && (
        <div>
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
            Recent RAIDs (24h)
          </div>
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            {stats.recent_raids.map((r: any) => (
              <button key={r.raid} onClick={() => onPickRecent(r.raid)} style={raidPill(r.has_errors)}>
                <span style={{ fontFamily: 'monospace' }}>{r.raid.slice(0, 8)}</span>
                <span style={{ opacity: .6, fontSize: '.7rem' }}>· {r.services.length}svc · {r.log_count}logs</span>
                {r.has_errors && <AlertCircle size={11} color="#ef4444" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div style={banner('#ef4444')}><AlertCircle size={14} /> {error}</div>}

      {/* Trace result */}
      {trace?.summary && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Summary */}
          <div style={card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
              <Field label="RAID" value={<code style={{ fontSize: '.78rem' }}>{trace.raid}</code>} />
              <Field label="Total Logs" value={trace.summary.total_logs} />
              <Field label="Services" value={trace.summary.service_count} />
              <Field label="Duration" value={`${trace.summary.total_duration_ms} ms`} icon={<Clock size={12} />} />
              <Field label="Status" value={trace.summary.has_errors ? 'Errors' : 'OK'} accent={trace.summary.has_errors ? '#ef4444' : '#22c55e'} />
            </div>
          </div>

          {/* Per-service breakdown */}
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Per-Service Timeline
          </div>
          {Object.entries(trace.by_service).map(([svc, logs]: any) => {
            const color = SERVICE_COLORS[svc] || '#9ca3af';
            return (
              <div key={svc} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  <Server size={14} />
                  <strong style={{ fontSize: '.95rem' }}>{svc}</strong>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '.78rem' }}>
                    {logs.length} log{logs.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {logs.map((l: any) => (
                    <div key={l._id} style={{
                      display: 'grid', gridTemplateColumns: '90px 60px 1fr 60px', gap: '.6rem',
                      alignItems: 'center', padding: '.4rem .5rem', borderTop: '1px solid var(--border)',
                      fontFamily: 'monospace', fontSize: '.78rem',
                    }}>
                      <span style={{ color: 'var(--text-muted)' }}>{(l.timestamp || '').slice(11, 23)}</span>
                      <span style={{ color: LEVEL_COLORS[l.level] || '#9ca3af', fontWeight: 600, textTransform: 'uppercase', fontSize: '.7rem' }}>
                        {l.level}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message}</span>
                      <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
                        {l.response_time != null ? `${l.response_time}ms` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <button onClick={() => nav(`/admin/observability/logs?raid=${trace.raid}`)} style={btnGhost}>
            View raw logs <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ───────── helpers ─────────

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '1rem',
};

const btnPrimary: React.CSSProperties = {
  background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8,
  padding: '.55rem 1rem', fontSize: '.85rem', cursor: 'pointer', fontWeight: 500,
};

const btnGhost: React.CSSProperties = {
  background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '.5rem .75rem', fontSize: '.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '.4rem',
};

const banner = (color: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '.5rem',
  padding: '.6rem .85rem', borderRadius: 8, fontSize: '.85rem',
  background: `${color}1a`, color, border: `1px solid ${color}55`,
});

const raidPill = (hasErrors: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '.4rem',
  padding: '.3rem .6rem', borderRadius: 999, fontSize: '.78rem',
  border: `1px solid ${hasErrors ? '#ef444455' : 'var(--border)'}`,
  background: hasErrors ? '#ef44441a' : 'var(--bg-input)',
  color: 'var(--text)', cursor: 'pointer',
});

function StatCard({ label, value, accent }: { label: string; value: any; accent?: string }) {
  return (
    <div style={{ ...card, padding: '.75rem 1rem' }}>
      <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 600, color: accent || 'var(--text)', marginTop: '.2rem' }}>{value}</div>
    </div>
  );
}

function Field({ label, value, accent, icon }: { label: string; value: any; accent?: string; icon?: any }) {
  return (
    <div>
      <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: '.95rem', fontWeight: 500, color: accent || 'var(--text)', marginTop: '.2rem', display: 'flex', alignItems: 'center', gap: '.3rem' }}>
        {icon}{value}
      </div>
    </div>
  );
}
