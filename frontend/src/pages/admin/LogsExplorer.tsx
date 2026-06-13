import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import apiClient from '../../api/client';

const LEVEL_COLORS: Record<string, string> = {
  info: '#22c55e', warn: '#f59e0b', error: '#ef4444', debug: '#6b7280',
};
const SERVICES = ['', 'gateway', 'core', 'orchestrator', 'admin', 'assessment'];
const LEVELS = ['', 'info', 'warn', 'error', 'debug'];

export default function LogsExplorer() {
  const [params, setParams] = useSearchParams();
  const [logs, setLogs] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({ page: 1, total: 0, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    service: params.get('service') || '',
    level: params.get('level') || '',
    raid: params.get('raid') || '',
    user_id: params.get('user_id') || '',
    search: params.get('search') || '',
  });
  const [page, setPage] = useState(parseInt(params.get('page') || '1'));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) qs.append(k, v); });
      qs.append('page', String(page));
      qs.append('limit', '50');
      const res = await apiClient.get(`/api/admin/telemetry/logs?${qs.toString()}`);
      setLogs(res.data?.logs || []);
      setPagination(res.data?.pagination || { page: 1, total: 0, pages: 0 });
    } catch (e: any) {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page]);
  useEffect(() => {
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) next.set(k, v); });
    if (page > 1) next.set('page', String(page));
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  const apply = (e: React.FormEvent) => { e.preventDefault(); setPage(1); load(); };

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 1300 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <Filter size={18} /> Logs Explorer
        </h2>
        <p style={{ margin: '.25rem 0 0', color: 'var(--text-muted)', fontSize: '.85rem' }}>
          Searchable log explorer across all services. 30-day TTL.
        </p>
      </div>

      {/* Filters */}
      <form onSubmit={apply} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto auto', gap: '.5rem' }}>
        <select value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })} style={input}>
          {SERVICES.map((s) => <option key={s} value={s}>{s ? `service: ${s}` : 'all services'}</option>)}
        </select>
        <select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })} style={input}>
          {LEVELS.map((l) => <option key={l} value={l}>{l ? `level: ${l}` : 'all levels'}</option>)}
        </select>
        <input value={filters.raid} onChange={(e) => setFilters({ ...filters, raid: e.target.value })} placeholder="raid" style={{ ...input, fontFamily: 'monospace' }} />
        <input value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })} placeholder="user id" style={input} />
        <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="message contains…" style={input} />
        <button type="submit" disabled={loading} style={btn}>{loading ? '…' : 'Apply'}</button>
        <button type="button" onClick={load} style={btn} title="Refresh"><RefreshCw size={14} /></button>
      </form>

      {/* Result table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ ...rowGrid, padding: '.55rem .75rem', borderBottom: '1px solid var(--border)', fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          <span></span><span>Time</span><span>Service</span><span>Lvl</span><span>Message</span><span>Status</span><span>Lat</span>
        </div>
        {logs.length === 0 && !loading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No logs match the current filters.</div>
        )}
        {logs.map((l) => {
          const open = expanded.has(l._id);
          return (
            <div key={l._id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div onClick={() => toggle(l._id)} style={{ ...rowGrid, padding: '.45rem .75rem', cursor: 'pointer', fontFamily: 'monospace', fontSize: '.78rem' }}>
                <span>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                <span style={{ color: 'var(--text-muted)' }}>{(l.timestamp || '').slice(11, 23)}</span>
                <span>{l.service}</span>
                <span style={{ color: LEVEL_COLORS[l.level] || '#9ca3af', fontWeight: 600, textTransform: 'uppercase', fontSize: '.7rem' }}>{l.level}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message}</span>
                <span style={{ color: l.status_code >= 500 ? '#ef4444' : l.status_code >= 400 ? '#f59e0b' : 'var(--text-muted)' }}>{l.status_code ?? ''}</span>
                <span style={{ color: 'var(--text-muted)' }}>{l.response_time != null ? `${l.response_time}ms` : ''}</span>
              </div>
              {open && (
                <div style={{ padding: '.6rem 1.25rem .9rem 2rem', background: 'var(--bg-input)', fontFamily: 'monospace', fontSize: '.75rem', display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '.25rem', columnGap: '.75rem' }}>
                  {l.raid && <><span style={{ color: 'var(--text-muted)' }}>raid</span><span>{l.raid}</span></>}
                  {l.user_id && <><span style={{ color: 'var(--text-muted)' }}>user_id</span><span>{l.user_id}</span></>}
                  {l.method && <><span style={{ color: 'var(--text-muted)' }}>method</span><span>{l.method} {l.path}</span></>}
                  {l.ip && <><span style={{ color: 'var(--text-muted)' }}>ip</span><span>{l.ip}</span></>}
                  {l.user_agent && <><span style={{ color: 'var(--text-muted)' }}>ua</span><span style={{ wordBreak: 'break-all' }}>{l.user_agent}</span></>}
                  {l.meta && <><span style={{ color: 'var(--text-muted)' }}>meta</span><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(l.meta, null, 2)}</pre></>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '.75rem', fontSize: '.85rem' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={btn}>Prev</button>
          <span style={{ color: 'var(--text-muted)' }}>Page {pagination.page} of {pagination.pages} · {pagination.total} total</span>
          <button onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages} style={btn}>Next</button>
        </div>
      )}
    </div>
  );
}

const rowGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '20px 110px 100px 50px 1fr 70px 70px',
  alignItems: 'center', gap: '.5rem',
};

const input: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, padding: '.5rem .65rem',
  background: 'var(--bg-input)', fontSize: '.82rem', outline: 'none',
};

const btn: React.CSSProperties = {
  background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '.5rem .85rem', fontSize: '.82rem', cursor: 'pointer',
};
