import { useEffect, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import apiClient from '../api/client';
import ErrorBanner, { extractErrorMessage } from '../components/ErrorBanner';
import { Skeleton, SkeletonStatGrid, SkeletonStatCard, SkeletonTableRows, SkeletonLines } from '../components/Skeleton';
import SourcesPopover from '../components/SourcesPopover';
import {
  Award, BookOpen, TrendingUp, Target, Brain,
  Clock, CheckCircle2, Users, Shield, BarChart3, Calendar,
  Sparkles, Play, RefreshCw, AlertTriangle, Heart, Zap, Activity,
  Eye, ChevronDown, ChevronRight, Mail,
} from 'lucide-react';

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  if (user?.role === 'admin') return <AdminDash />;
  if (user?.role === 'manager') return <ManagerDash user={user} />;
  return <LearnerDash user={user} />;
}

// ─── ADMIN ──────────────────────────────────────────────────────────────

function AdminDash() {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.get('/api/users/admin/stats'),
      apiClient.get('/api/users/admin/users'),
    ])
      .then(([s, u]) => { setStats(s.data); setUsers(u.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="dash-welcome">
        <h1>Admin Dashboard</h1>
        <p>System overview and management</p>
      </div>
      <div className="dash-section">
        {loading || !stats ? (
          <SkeletonStatGrid count={6} />
        ) : (
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-icon purple"><Users size={20} /></div><div className="stat-content"><div className="stat-value">{stats.total_users}</div><div className="stat-label">Total Users</div></div></div>
            <div className="stat-card"><div className="stat-icon blue"><BookOpen size={20} /></div><div className="stat-content"><div className="stat-value">{stats.total_learners}</div><div className="stat-label">Learners</div></div></div>
            <div className="stat-card"><div className="stat-icon amber"><Shield size={20} /></div><div className="stat-content"><div className="stat-value">{stats.total_managers}</div><div className="stat-label">Managers</div></div></div>
            <div className="stat-card"><div className="stat-icon green"><Target size={20} /></div><div className="stat-content"><div className="stat-value">{stats.total_courses}</div><div className="stat-label">Courses</div></div></div>
            <div className="stat-card"><div className="stat-icon cyan"><Award size={20} /></div><div className="stat-content"><div className="stat-value">{stats.total_certifications}</div><div className="stat-label">Certifications</div></div></div>
            <div className="stat-card"><div className="stat-icon rose"><BarChart3 size={20} /></div><div className="stat-content"><div className="stat-value">{stats.total_roles}</div><div className="stat-label">Job Roles</div></div></div>
          </div>
        )}
      </div>
      <div className="dash-section"><div className="dash-grid">
        <div className="card"><div className="card-header"><h3>Recent Users</h3></div><div className="card-body"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>{loading ? (<SkeletonTableRows rows={5} cols={3} colWidths={['60%', '70%', '40%']} />) : users.map((u: any, i: number) => (<tr key={i}><td style={{ fontWeight: 500 }}>{u.full_name}</td><td>{u.email}</td><td><span className={`badge ${u.role === 'admin' ? 'completed' : u.role === 'manager' ? 'in-progress' : 'not-started'}`}>{u.role}</span></td></tr>))}</tbody></table></div></div>
      </div></div>
    </div>
  );
}

// ─── MANAGER ────────────────────────────────────────────────────────────

function ManagerDash({ user }: { user: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get('/api/users/team')
      .then((r) => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));

    apiClient.get('/api/orchestrator/insights')
      .then((r) => { if (r.data?.cached && r.data.output) setInsights(r.data.output); })
      .catch(() => {});
  }, []);

  const handleRefreshInsights = async () => {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const res = await apiClient.post('/api/orchestrator/insights/refresh');
      if (res.data?.output) setInsights(res.data.output);
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = extractErrorMessage(e, 'Failed to refresh insights');
      setInsightsError(status ? `[${status}] ${msg}` : msg);
      console.error('Failed to refresh insights', e);
    } finally {
      setInsightsLoading(false);
    }
  };

  if (loading) return (
    <div>
      <div className="dash-welcome">
        <h1>Team Dashboard</h1>
        <p>Track your team's certification progress</p>
      </div>
      <div className="dash-section">
        <SkeletonStatGrid count={3} />
      </div>
      <div className="dash-section">
        <div className="card" aria-busy="true" style={{ padding: '1.25rem' }}>
          <Skeleton width="35%" height={14} />
          <div style={{ height: 14 }} />
          <SkeletonLines count={3} />
        </div>
      </div>
    </div>
  );
  if (!data) return <div className="empty-state"><p>Unable to load dashboard</p></div>;

  const stats = data.team_stats || {};
  const members = data.team_members || [];
  return (
    <div>
      <div className="dash-welcome">
        <h1>Team Dashboard</h1>
        <p>Track your team's certification progress</p>
      </div>
      <div className="dash-section">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-icon blue"><Users size={20} /></div><div className="stat-content"><div className="stat-value">{stats.total_members}</div><div className="stat-label">Team Members</div></div></div>
          <div className="stat-card"><div className="stat-icon green"><CheckCircle2 size={20} /></div><div className="stat-content"><div className="stat-value">{stats.certs_completed}</div><div className="stat-label">Certs Earned</div></div></div>
          <div className="stat-card"><div className="stat-icon purple"><TrendingUp size={20} /></div><div className="stat-content"><div className="stat-value">{stats.in_progress}</div><div className="stat-label">In Progress</div></div></div>
        </div>
      </div>

      {/* Manager Insights Agent (live) */}
      <div className="dash-section">
        <div className="card agent-recommendation-card" style={{ background: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)', borderColor: 'rgba(147, 51, 234, 0.15)' }}>
          <span className="agent-chip" style={{ background: 'rgba(147, 51, 234, 0.08)', color: '#9333ea', borderColor: 'rgba(147, 51, 234, 0.2)' }}><BarChart3 size={11} /> Manager Insights Agent</span>
          <div className="card-body" style={{ padding: '1.25rem', paddingTop: '2.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Brain size={16} style={{ color: '#9333ea' }} /> AI Team Readiness
                {Array.isArray((insights as any)?.sources) && (insights as any).sources.length > 0 && (
                  <SourcesPopover sources={(insights as any).sources} label={`${(insights as any).sources.length} source${(insights as any).sources.length === 1 ? '' : 's'}`} />
                )}
              </span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }}
                onClick={handleRefreshInsights}
                disabled={insightsLoading}
                title={insightsLoading ? 'Analysing\u2026' : 'Refresh insights'}
                aria-label={insightsLoading ? 'Analysing\u2026' : 'Refresh insights'}
              >
                <RefreshCw size={12} className={insightsLoading ? 'spin' : ''} />
              </button>
            </h3>
            <ErrorBanner message={insightsError} onDismiss={() => setInsightsError(null)} />
            {insightsLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                Aggregating team signals...
              </div>
            ) : insights && typeof insights === 'object' && (insights as any).summary ? (
              (() => {
                const s = (insights as any).summary || {};
                // Tolerate both schema dialects (avg_*_pct vs overall_*).
                const pass = s.avg_pass_rate_pct ?? s.overall_pass_rate ?? null;
                const completion = s.avg_completion_pct ?? s.overall_completion_pct ?? null;
                const trend = s.trend_last_30d ?? null;
                const totalMembers = s.total_members ?? null;
                const completedCount = s.completed_courses_count ?? null;
                const inProgressCount = s.in_progress_courses_count ?? null;
                const atRisk = (insights as any).at_risk || [];
                const strengths = (insights as any).strengths || [];
                const weakAreas = (insights as any).weak_areas || [];
                const capacityFlag = (insights as any).capacity_flag || '';
                const actions = (insights as any).recommended_actions || [];
                const fmtPct = (v: any) => (v === null || v === undefined || v === '' ? '—' : `${typeof v === 'number' ? Math.round(v * 10) / 10 : v}%`);
                return (
                  <div>
                    {/* Headline KPI tiles */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                      <div style={{ padding: '0.75rem', background: 'rgba(147, 51, 234, 0.05)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pass Rate</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#9333ea' }}>{fmtPct(pass)}</div>
                      </div>
                      <div style={{ padding: '0.75rem', background: 'rgba(147, 51, 234, 0.05)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completion</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#9333ea' }}>{fmtPct(completion)}</div>
                      </div>
                      {trend !== null && (
                        <div style={{ padding: '0.75rem', background: 'rgba(147, 51, 234, 0.05)', borderRadius: 'var(--radius-sm)' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trend (30d)</div>
                          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#9333ea' }}>{trend}</div>
                        </div>
                      )}
                      {totalMembers !== null && (
                        <div style={{ padding: '0.75rem', background: 'rgba(147, 51, 234, 0.05)', borderRadius: 'var(--radius-sm)' }}>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Members</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#9333ea' }}>
                            {totalMembers}
                            {(completedCount !== null || inProgressCount !== null) && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: '0.4rem' }}>
                                · {completedCount ?? 0} done / {inProgressCount ?? 0} active
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {capacityFlag && (
                      <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertTriangle size={13} style={{ color: 'var(--warning)' }} />
                        <span><strong>Capacity:</strong> {capacityFlag}</span>
                      </div>
                    )}

                    {atRisk.length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <AlertTriangle size={14} style={{ color: 'var(--warning)' }} /> At-Risk Learners ({atRisk.length})
                        </h4>
                        {atRisk.slice(0, 5).map((r: any, i: number) => {
                          const name = r.full_name || r.name || r.learner_id || r.user_id || 'Unknown';
                          const reasons = Array.isArray(r.reasons) ? r.reasons.join('; ') : (r.reason || '');
                          const action = r.suggested_action || r.action || '';
                          return (
                            <div key={i} style={{ padding: '0.5rem 0.75rem', background: 'rgba(245, 158, 11, 0.05)', borderRadius: 'var(--radius-sm)', marginBottom: '0.4rem', fontSize: '0.8rem' }}>
                              <strong>{name}</strong>{reasons ? ` · ${reasons}` : ''}
                              {action && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>→ {action}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {(strengths.length > 0 || weakAreas.length > 0) && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                        {strengths.length > 0 && (
                          <div style={{ padding: '0.75rem', background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.18)', borderRadius: 'var(--radius-sm)' }}>
                            <h4 style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <CheckCircle2 size={13} /> Strengths
                            </h4>
                            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', lineHeight: 1.55 }}>
                              {strengths.slice(0, 4).map((x: any, i: number) => (
                                <li key={i}>
                                  {x.course_name || x.name || x.area || 'Course'}
                                  {(x.avg_completion ?? x.score ?? x.value) !== undefined && (
                                    <span style={{ color: 'var(--text-tertiary)', marginLeft: '0.3rem' }}>· {fmtPct(x.avg_completion ?? x.score ?? x.value)}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {weakAreas.length > 0 && (
                          <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.18)', borderRadius: 'var(--radius-sm)' }}>
                            <h4 style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <AlertTriangle size={13} /> Weak Areas
                            </h4>
                            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', lineHeight: 1.55 }}>
                              {weakAreas.slice(0, 4).map((x: any, i: number) => (
                                <li key={i}>
                                  {x.course_name || x.name || x.area || 'Course'}
                                  {(x.avg_completion ?? x.score ?? x.value) !== undefined && (
                                    <span style={{ color: 'var(--text-tertiary)', marginLeft: '0.3rem' }}>· {fmtPct(x.avg_completion ?? x.score ?? x.value)}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {actions.length > 0 && (
                      <div style={{ padding: '0.75rem', background: 'rgba(147, 51, 234, 0.05)', borderRadius: 'var(--radius-sm)' }}>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>Recommended Actions</h4>
                        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', lineHeight: 1.6 }}>
                          {actions.map((a: string, i: number) => <li key={i}>{a}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : insights ? (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.6' }}>
                {typeof insights === 'string' ? insights : JSON.stringify(insights, null, 2)}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <p style={{ marginBottom: '0.75rem' }}>Click refresh to get an AI-generated team readiness report.</p>
                <button className="btn btn-primary" style={{ fontSize: '0.78rem', background: '#9333ea' }} onClick={handleRefreshInsights}>
                  <Sparkles size={13} /> Generate Insights
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dash-section">
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={16} style={{ color: 'var(--text-secondary)' }} /> Team Members
              <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-tertiary)', padding: '0.15rem 0.5rem', background: 'var(--surface-2)', borderRadius: '999px' }}>{members.length}</span>
            </h3>
            <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '0.35rem 0.7rem' }} onClick={() => navigate('/courses')} title="Browse course catalog">
              <BookOpen size={12} /> All Courses
            </button>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '32px' }}></th>
                  <th>Name</th>
                  <th>Email</th>
                  <th style={{ textAlign: 'center' }}>Certs</th>
                  <th style={{ textAlign: 'center' }}>In Progress</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m: any) => {
                  const mid = String(m.id || m.email);
                  const isOpen = expandedMember === mid;
                  const memberCerts = m.certifications || [];
                  const memberCourses = m.in_progress_courses || [];
                  return (
                    <Fragment key={mid}>
                      <tr style={isOpen ? { background: 'var(--surface-2)' } : undefined}>
                        <td>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '0.25rem', minWidth: 0 }}
                            onClick={() => setExpandedMember(isOpen ? null : mid)}
                            aria-label={isOpen ? 'Collapse' : 'Expand'}
                            title={isOpen ? 'Hide details' : 'Show details'}
                          >
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>
                        <td style={{ fontWeight: 500 }}>{m.full_name}</td>
                        <td>
                          <a href={`mailto:${m.email}`} style={{ color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }} title={`Email ${m.full_name}`}>
                            <Mail size={11} /> {m.email}
                          </a>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{m.certs_completed}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{m.courses_in_progress}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: '0.7rem', padding: '0.3rem 0.6rem' }}
                            onClick={() => setExpandedMember(isOpen ? null : mid)}
                            title="View courses & certifications"
                          >
                            <Eye size={12} /> {isOpen ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--surface-2)', padding: '1rem 1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                              <div>
                                <h4 style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                                  <Award size={13} /> Certifications ({memberCerts.length})
                                </h4>
                                {memberCerts.length === 0 ? (
                                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>None earned yet.</div>
                                ) : (
                                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    {memberCerts.map((c: any, i: number) => (
                                      <li key={i} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <CheckCircle2 size={12} style={{ color: 'var(--success, #15803d)', flexShrink: 0 }} />
                                        <span>{c.cert_code && <strong>{c.cert_code}</strong>}{c.cert_code && c.course_name ? ' · ' : ''}{c.course_name || (c.course_id ? `#${String(c.course_id).slice(-6)}` : 'Unknown')}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div>
                                <h4 style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
                                  <BookOpen size={13} /> In-Progress Courses ({memberCourses.length})
                                </h4>
                                {memberCourses.length === 0 ? (
                                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No active courses.</div>
                                ) : (
                                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    {memberCourses.map((c: any, i: number) => (
                                      <li key={i} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <BookOpen size={12} style={{ color: 'var(--accent, #9333ea)', flexShrink: 0 }} />
                                        <span>{c.cert_code && <strong>{c.cert_code}</strong>}{c.cert_code && c.course_name ? ' · ' : ''}{c.course_name || (c.course_id ? `#${String(c.course_id).slice(-6)}` : 'Unknown')}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {(data.recent_assessments || []).length > 0 && (
        <div className="dash-section">
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={16} style={{ color: 'var(--text-secondary)' }} /> Recent Team Assessments
              </h3>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Last {Math.min(10, data.recent_assessments.length)}</span>
            </div>
            <div className="card-body">
              <table className="data-table">
                <thead><tr><th>Course</th><th style={{ textAlign: 'center' }}>Score</th><th style={{ textAlign: 'center' }}>Result</th></tr></thead>
                <tbody>
                  {data.recent_assessments.slice(0, 10).map((a: any, i: number) => {
                    const cid = String(a.course_id || '');
                    const name = a.course_title || (cid ? `#${cid.slice(-6)}` : 'Unknown course');
                    const code = a.cert_code;
                    const score = Number(a.score_percentage) || 0;
                    return (
                      <tr key={i}>
                        <td title={cid} style={{ fontWeight: 500 }}>
                          {code && <span style={{ display: 'inline-block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', marginRight: '0.4rem' }}>{code}</span>}
                          {name}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{score}%</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${a.passed ? 'completed' : 'not-started'}`}>{a.passed ? 'Pass' : 'Fail'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LEARNER ────────────────────────────────────────────────────────────

function LearnerDash({ user }: { user: any }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsCached, setRecsCached] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [plan, setPlan] = useState<any>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<any>(null);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [certs, setCerts] = useState<any[]>([]);
  const [startingCode, setStartingCode] = useState<string | null>(null);

  const handleStartCourse = async (code: string) => {
    if (!code) return;
    const already = certs.find((c: any) => c.cert_code === code);
    if (already && (already.status === 'in_progress' || already.status === 'completed')) {
      navigate(`/courses/${code}`);
      return;
    }
    setStartingCode(code);
    try {
      const res = await apiClient.post('/api/users/courses/enroll', { cert_code: code });
      const newCert = res.data;
      if (newCert?.course_id) {
        setCerts((prev) => {
          const idx = prev.findIndex((c: any) => c.cert_code === newCert.cert_code);
          if (idx === -1) return [...prev, newCert];
          const next = prev.slice();
          next[idx] = { ...prev[idx], ...newCert };
          return next;
        });
      }
      navigate(`/courses/${code}`);
    } catch (e) {
      console.error('Failed to enroll in course', e);
      navigate(`/courses/${code}`);
    } finally {
      setStartingCode(null);
    }
  };

  useEffect(() => {
    // Wait for stats AND all three cached agent endpoints to settle before
    // hiding the skeleton — otherwise we flash empty "No X cached yet" panels
    // while the agent caches are still in-flight.
    Promise.allSettled([
      apiClient.get('/api/users/stats').then((s) => { setStats(s.data); }),
      apiClient.get('/api/orchestrator/recommendations').then((r) => {
        if (r.data?.cached && r.data.output) {
          setRecommendations(r.data.output);
          setRecsCached(true);
        }
      }),
      apiClient.get('/api/orchestrator/plan').then((r) => {
        if (r.data?.cached && r.data.output) setPlan(r.data.output);
      }),
      apiClient.get('/api/orchestrator/engagement').then((r) => {
        if (r.data?.cached && r.data.output) setEngagement(r.data.output);
      }),
    ]).finally(() => setLoading(false));
  }, []);

  // Fetch enrollment status only for the cert codes shown in recommendations,
  // instead of pulling every required + enrolled course on page load.
  useEffect(() => {
    if (!Array.isArray(recommendations) || recommendations.length === 0) return;
    const codes = recommendations
      .map((r: any) => r.cert_code || r.certification_code)
      .filter((c: any): c is string => typeof c === 'string' && c.length > 0);
    if (codes.length === 0) return;
    apiClient.get(`/api/users/courses?cert_codes=${encodeURIComponent(codes.join(','))}`)
      .then((r) => { setCerts(r.data || []); })
      .catch(console.error);
  }, [recommendations]);

  const handleRefreshRecommendations = async () => {
    setRecsLoading(true);
    setRecsError(null);
    try {
      const res = await apiClient.post('/api/orchestrator/recommendations/refresh');
      if (res.data?.output) {
        setRecommendations(res.data.output);
        setRecsCached(true);
      }
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = extractErrorMessage(e, 'Failed to refresh recommendations');
      setRecsError(status ? `[${status}] ${msg}` : msg);
      console.error('Failed to refresh recommendations', e);
    } finally {
      setRecsLoading(false);
    }
  };

  const handleRefreshPlan = async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const res = await apiClient.post('/api/orchestrator/plan/refresh', {});
      if (res.data?.output) setPlan(res.data.output);
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = extractErrorMessage(e, 'Failed to refresh study plan');
      setPlanError(status ? `[${status}] ${msg}` : msg);
      console.error('Failed to refresh plan', e);
    } finally {
      setPlanLoading(false);
    }
  };

  const handleRefreshEngagement = async () => {
    setEngagementLoading(true);
    setEngagementError(null);
    try {
      const res = await apiClient.post('/api/orchestrator/engagement/refresh');
      if (res.data?.output) setEngagement(res.data.output);
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = extractErrorMessage(e, 'Failed to refresh engagement nudge');
      setEngagementError(status ? `[${status}] ${msg}` : msg);
      console.error('Failed to refresh engagement', e);
    } finally {
      setEngagementLoading(false);
    }
  };

  const firstName = user?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? 'Burning the midnight oil' :
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
    hour < 21 ? 'Good evening' : 'Welcome back';

  if (loading) {
    const agentPillNames = ['Curator', 'Planner', 'Engagement', 'Insights', 'Assessment'];
    return (
      <div>
        {/* Hero — matches real hero shape (greeting + inline stats + agent pills) */}
        <div className="dash-hero">
          <div className="dash-hero-row">
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1>{greeting}, {firstName} <span className="wave-emoji">👋</span></h1>
              <div className="dash-hero-subtitle">
                <span className="role-pill"><Shield size={11} /> {user?.role || 'Learner'}</span>
                <span style={{ opacity: 0.7 }}>·</span>
                <span>5 AI agents working for you</span>
              </div>
            </div>
            <div className="dash-hero-stats" aria-busy="true">
              {[BookOpen, Award, Activity].map((Icon, i) => (
                <div className="hero-stat" key={i}>
                  <div className="hero-stat-icon" style={{ opacity: 0.5 }}><Icon size={16} /></div>
                  <div>
                    <Skeleton width={32} height={18} />
                    <div style={{ height: 4 }} />
                    <Skeleton width={56} height={10} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="agent-status-row" aria-busy="true">
            {agentPillNames.map((name) => (
              <span className="agent-pill" key={name} style={{ opacity: 0.6 }}>
                <span className="dot" /> {name}
              </span>
            ))}
          </div>
        </div>

        {/* Engagement featured nudge — orange banner card */}
        <div className="engagement-featured" aria-busy="true">
          <div className="engagement-featured-icon"><Heart size={26} /></div>
          <div className="engagement-featured-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <Skeleton width={60} height={18} radius={999} />
              <Skeleton width={70} height={18} radius={999} />
            </div>
            <Skeleton width="55%" height={18} />
            <SkeletonLines count={2} widths={['95%', '78%']} height={11} />
            <Skeleton width="40%" height={12} />
          </div>
        </div>

        {/* Two-column agents grid — curator + planner */}
        <div className="dash-agents-grid">
          {/* Curator skeleton (white card, 3 numbered rec items) */}
          <div className="card agent-recommendation-card" aria-busy="true">
            <span className="agent-chip"><Sparkles size={11} /> Learning Curator Agent</span>
            <div className="card-body" style={{ padding: '1.25rem', paddingTop: '2.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Target size={16} style={{ color: 'var(--accent-primary)' }} />
                  <Skeleton width={140} height={14} />
                </span>
                <Skeleton width={70} height={24} radius={6} />
              </div>
              <div className="curator-recommendations" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                {[1, 2, 3].map((i) => (
                  <div className="curator-rec-item" key={i} style={{ alignItems: 'flex-start' }}>
                    <div className={`curator-rec-priority prio-${i}`}>{i}</div>
                    <div className="curator-rec-content" style={{ flex: 1, minWidth: 0 }}>
                      <Skeleton width="70%" height={14} />
                      <div style={{ height: 6 }} />
                      <Skeleton width="35%" height={11} />
                      <div style={{ height: 6 }} />
                      <SkeletonLines count={2} widths={['92%', '70%']} height={10} />
                    </div>
                    <Skeleton width={64} height={28} radius={6} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Planner skeleton (green-tinted card, week grid + pace bar) */}
          <div
            className="card agent-recommendation-card"
            aria-busy="true"
            style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)', borderColor: 'rgba(22, 163, 74, 0.15)' }}
          >
            <span
              className="agent-chip"
              style={{ background: 'rgba(22, 163, 74, 0.08)', color: '#16a34a', borderColor: 'rgba(22, 163, 74, 0.2)' }}
            >
              <Clock size={11} /> Study Planner Agent
            </span>
            <div className="card-body" style={{ padding: '1.25rem', paddingTop: '2.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={16} style={{ color: '#16a34a' }} />
                  <Skeleton width={170} height={14} />
                </span>
                <Skeleton width={70} height={24} radius={6} />
              </div>
              <div className="planner-week-grid">
                {[1, 2, 3, 4].map((i) => (
                  <div className="planner-week-card" key={i}>
                    <div className="planner-week-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <Skeleton width={50} height={11} />
                      <Skeleton width={28} height={11} />
                    </div>
                    <Skeleton width="85%" height={20} radius={999} />
                    <div style={{ height: 6 }} />
                    <Skeleton width="60%" height={20} radius={999} />
                  </div>
                ))}
              </div>
              <div className="planner-pace-bar" style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                <Skeleton width="60%" height={12} />
                <Skeleton width={90} height={20} radius={999} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const inProgressCount = stats?.courses_in_progress ?? certs.filter((c: any) => c.status === 'in_progress').length;
  const completedCount = stats?.courses_completed ?? certs.filter((c: any) => c.status === 'completed').length;
  const weeklyHours = plan?.weekly_hours ?? null;
  const totalCerts = stats?.certs_earned ?? stats?.certs_completed ?? completedCount;

  const agentList = [
    { name: 'Curator', icon: Sparkles },
    { name: 'Planner', icon: Calendar },
    { name: 'Engagement', icon: Heart },
    { name: 'Insights', icon: BarChart3 },
    { name: 'Assessment', icon: Brain },
  ];

  return (
    <div>
      {/* Hero */}
      <div className="dash-hero">
        <div className="dash-hero-row">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1>
              {greeting}, {firstName} <span className="wave-emoji">👋</span>
            </h1>
            <div className="dash-hero-subtitle">
              <span className="role-pill">
                <Shield size={11} /> {stats?.role_info?.role_name || user?.role || 'Learner'}
              </span>
              <span style={{ opacity: 0.7 }}>·</span>
              <span>5 AI agents working for you</span>
            </div>
          </div>
          <div className="dash-hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-icon" style={{ color: '#60a5fa' }}><BookOpen size={16} /></div>
              <div>
                <div className="hero-stat-value">{inProgressCount}</div>
                <div className="hero-stat-label">In Progress</div>
              </div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-icon" style={{ color: '#34d399' }}><Award size={16} /></div>
              <div>
                <div className="hero-stat-value">{totalCerts}</div>
                <div className="hero-stat-label">Earned</div>
              </div>
            </div>
            {weeklyHours !== null && (
              <div className="hero-stat">
                <div className="hero-stat-icon" style={{ color: '#a78bfa' }}><Activity size={16} /></div>
                <div>
                  <div className="hero-stat-value">{weeklyHours}h</div>
                  <div className="hero-stat-label">Weekly Pace</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="agent-status-row">
          {agentList.map((a) => (
            <span className="agent-pill" key={a.name}>
              <span className="dot" />
              <a.icon size={11} /> {a.name}
            </span>
          ))}
        </div>
      </div>

      {/* Featured Engagement Nudge — always rendered so the refresh button is reachable */}
      {(() => {
        const isObj = engagement && typeof engagement === 'object' && !Array.isArray(engagement);
        const hasValidShape = isObj && (engagement as any).headline;
        const fallbackText =
          typeof engagement === 'string'
            ? engagement
            : isObj
              ? ((engagement as any).body || (engagement as any).message || '')
              : '';

        return (
          <div className="engagement-featured">
            <div className="engagement-featured-icon">
              <Heart size={26} />
            </div>
            <div className="engagement-featured-content">
              {hasValidShape ? (
                <>
                  <div className="engagement-featured-tags">
                    <span
                      className="agent-chip"
                      style={{
                        position: 'static',
                        background: 'rgba(249,115,22,0.10)',
                        color: '#c2410c',
                        borderColor: 'rgba(249,115,22,0.25)',
                      }}
                    >
                      <Heart size={11} /> Engagement Agent
                    </span>
                    {(engagement as any).state && <span className="tag">{(engagement as any).state}</span>}
                    {(engagement as any).tone && <span className="tag" style={{ background: 'rgba(249,115,22,0.08)' }}>{(engagement as any).tone}</span>}
                    {Array.isArray((engagement as any).sources) && (engagement as any).sources.length > 0 && (
                      <SourcesPopover sources={(engagement as any).sources} label={`${(engagement as any).sources.length} source${(engagement as any).sources.length === 1 ? '' : 's'}`} />
                    )}
                  </div>
                  <div className="headline">{(engagement as any).headline}</div>
                  <div className="body">{(engagement as any).body}</div>
                  {(engagement as any).suggested_action && (
                    <div className="engagement-featured-action">
                      <Zap size={13} /> <strong>Suggested:</strong> {(engagement as any).suggested_action.label}
                      {(engagement as any).best_nudge_window && (
                        <span style={{ marginLeft: '0.4rem', opacity: 0.7 }}>· {(engagement as any).best_nudge_window}</span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="headline">Daily nudge</div>
                  <div className="body" style={{ whiteSpace: 'pre-wrap' }}>
                    {fallbackText || 'No nudge available yet — hit refresh to generate one.'}
                  </div>
                </>
              )}
            </div>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem', alignSelf: 'flex-start', flexShrink: 0, color: '#7c2d12' }}
              onClick={handleRefreshEngagement}
              disabled={engagementLoading}
              title="Refresh nudge"
            >
              <RefreshCw size={12} className={engagementLoading ? 'spin' : ''} />
            </button>
          </div>
        );
      })()}
      <ErrorBanner message={engagementError} onDismiss={() => setEngagementError(null)} />

      {/* Two-column agents grid */}
      <div className="dash-agents-grid">
        {/* Curator Recommendation */}
        <div className="card agent-recommendation-card">
          <span className="agent-chip"><Sparkles size={11} /> Learning Curator Agent</span>
          <div className="card-body" style={{ padding: '1.25rem', paddingTop: '2.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Target size={16} style={{ color: 'var(--accent-primary)' }} /> Your Learning Path
              </span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }}
                onClick={handleRefreshRecommendations}
                disabled={recsLoading}
                title={recsLoading ? 'Asking Agent…' : 'Refresh recommendations'}
                aria-label={recsLoading ? 'Asking Agent…' : 'Refresh recommendations'}
              >
                <RefreshCw size={12} className={recsLoading ? 'spin' : ''} />
              </button>
            </h3>
            <ErrorBanner message={recsError} onDismiss={() => setRecsError(null)} />
            {recsLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                Getting personalized recommendations from AI agent...
              </div>
            ) : recommendations ? (
              <div className="curator-recommendations">
                {Array.isArray(recommendations) ? recommendations.map((rec: any, idx: number) => {
                  const code = rec.cert_code || rec.certification_code;
                  const enrolled = code ? certs.find((c: any) => c.cert_code === code) : undefined;
                  const status = enrolled?.status;
                  const buttonLabel =
                    status === 'in_progress' ? 'Continue' :
                    status === 'completed' ? 'Review' : 'Start';
                  const prio = Number(rec.priority) || idx + 1;
                  const prioClass = prio === 1 ? 'prio-1' : prio === 2 ? 'prio-2' : 'prio-3';
                  return (
                    <div className="curator-rec-item interactive" key={idx}>
                      <div className={`curator-rec-priority ${prioClass}`}>{idx + 1}</div>
                      <div className="curator-rec-content">
                        <div className="curator-rec-title" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span>{rec.title || rec.course_name || rec.name}</span>
                          {status && (
                            <span className={`rec-status-chip ${status}`}>
                              {status === 'in_progress' && <Clock size={10} />}
                              {status === 'completed' && <CheckCircle2 size={10} />}
                              {status.replace('_', ' ')}
                            </span>
                          )}
                          {Array.isArray(rec.sources) && rec.sources.length > 0 && (
                            <SourcesPopover sources={rec.sources} />
                          )}
                        </div>
                        <div className="curator-rec-meta">{code} &middot; Priority {prio}</div>
                        <div className="curator-rec-reason">{rec.reason}</div>
                      </div>
                      {code && (
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '0.75rem', padding: '0.4rem 0.7rem', alignSelf: 'flex-start', flexShrink: 0 }}
                          disabled={startingCode === code}
                          onClick={() => handleStartCourse(code)}
                        >
                          {startingCode === code ? (
                            <><RefreshCw size={12} className="spin" /> Starting...</>
                          ) : (
                            <><Play size={12} /> {buttonLabel}</>
                          )}
                        </button>
                      )}
                    </div>
                  );
                }) : (
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.6' }}>
                    {typeof recommendations === 'string' ? recommendations : JSON.stringify(recommendations, null, 2)}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <p style={{ marginBottom: '0.75rem' }}>No recommendations cached yet.</p>
                <button className="btn btn-primary" style={{ fontSize: '0.78rem' }} onClick={handleRefreshRecommendations}>
                  <Sparkles size={13} /> Get AI Recommendations
                </button>
              </div>
            )}
            {recommendations && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => navigate('/courses')}>
                  <BookOpen size={13} /> Browse all courses
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Planner Agent Recommendation (live) */}
        <div className="card agent-recommendation-card" style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)', borderColor: 'rgba(22, 163, 74, 0.15)' }}>
          <span className="agent-chip" style={{ background: 'rgba(22, 163, 74, 0.08)', color: '#16a34a', borderColor: 'rgba(22, 163, 74, 0.2)' }}><Clock size={11} /> Study Planner Agent</span>
          <div className="card-body" style={{ padding: '1.25rem', paddingTop: '2.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={16} style={{ color: '#16a34a' }} /> Your Weekly Study Plan
                {plan && Array.isArray(plan.sources) && plan.sources.length > 0 && (
                  <SourcesPopover sources={plan.sources} />
                )}
              </span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }}
                onClick={handleRefreshPlan}
                disabled={planLoading}
                title={planLoading ? 'Asking Agent…' : 'Refresh plan'}
                aria-label={planLoading ? 'Asking Agent…' : 'Refresh plan'}
              >
                <RefreshCw size={12} className={planLoading ? 'spin' : ''} />
              </button>
            </h3>
            <ErrorBanner message={planError} onDismiss={() => setPlanError(null)} />
            {planLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                Building a capacity-aware plan...
              </div>
            ) : plan && typeof plan === 'object' && plan.weekly_plan ? (
              <div>
                {(() => {
                  // Planner agent returns one of two shapes:
                  //   (a) flat day sessions: [{day, topic, duration_min, ...}]
                  //   (b) nested weeks:      [{week, sessions|tasks: [...]}]
                  // Normalize both into a common [{label, tasks[]}] structure.
                  const raw = plan.weekly_plan || [];
                  const isFlatDays =
                    Array.isArray(raw) &&
                    raw.length > 0 &&
                    raw.every((e: any) => e && (e.day || e.topic) && !Array.isArray(e.sessions) && !Array.isArray(e.tasks) && !Array.isArray(e.activities));
                  const buckets: { label: string; rationale?: string; tasks: { module: string; day: string; hours: number }[] }[] = [];
                  if (isFlatDays) {
                    buckets.push({
                      label: `Week 1 of ${plan.weeks_to_exam_ready || 1}`,
                      tasks: raw.map((s: any) => ({
                        module: s.topic ?? s.module ?? s.name ?? s.title ?? '',
                        day: s.day ?? '',
                        hours: Number(s.expected_hours ?? s.hours ?? s.duration ?? (s.duration_min ? s.duration_min / 60 : 0)),
                      })),
                    });
                  } else {
                    raw.forEach((slot: any, idx: number) => {
                      const rawTasks = Array.isArray(slot.tasks)
                        ? slot.tasks
                        : Array.isArray(slot.sessions)
                        ? slot.sessions
                        : Array.isArray(slot.activities)
                        ? slot.activities
                        : [];
                      buckets.push({
                        label: `Week ${slot.week ?? idx + 1}`,
                        rationale: slot.rationale,
                        tasks: rawTasks.map((t: any) => ({
                          module: t.module ?? t.name ?? t.title ?? t.topic ?? '',
                          day: t.day ?? '',
                          hours: Number(t.expected_hours ?? t.hours ?? t.duration ?? (t.duration_min ? t.duration_min / 60 : 0)),
                        })),
                      });
                    });
                  }
                  return (
                    <div className="planner-week-grid">
                      {buckets.map((b, idx) => {
                        const totalHours = b.tasks.reduce((sum, t) => sum + (Number(t.hours) || 0), 0);
                        return (
                          <div className="planner-week-card" key={idx}>
                            <div className="planner-week-header">
                              <span className="planner-week-num">{b.label}</span>
                              <span className="planner-week-hours">{totalHours}h</span>
                            </div>
                            <div>
                              {b.tasks.length > 0 ? b.tasks.map((t, ti) => (
                                <span key={ti} className="planner-task-chip">
                                  {t.day ? `${t.day} · ` : ''}{t.module} · {t.hours}h
                                </span>
                              )) : (
                                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>No tasks scheduled</span>
                              )}
                            </div>
                            {b.rationale && (
                              <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                {b.rationale}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {Array.isArray(plan.milestones) && plan.milestones.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    <Target size={13} style={{ color: '#16a34a' }} />
                    <strong>Milestones:</strong>
                    {plan.milestones.map((m: any, i: number) => {
                      const text = typeof m === 'string'
                        ? m
                        : m && typeof m === 'object'
                          ? (m.week ? `W${m.week}: ` : '') + (m.goal ?? m.label ?? JSON.stringify(m))
                          : String(m);
                      return (
                        <span key={i} className="planner-task-chip" style={{ background: 'rgba(22,163,74,0.06)' }}>{text}</span>
                      );
                    })}
                  </div>
                )}
                <div className="planner-pace-bar">
                  <div>
                    <strong>Pace:</strong> {plan.weekly_hours}h/week → {plan.cert_code} ready in ~{plan.weeks_to_exam_ready} weeks
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="target-date">🎯 {plan.estimated_ready_date}</span>
                    {plan.capacity_flag && (
                      <span className={`capacity-flag ${plan.capacity_flag}`}>
                        {plan.capacity_flag === 'overloaded' ? <AlertTriangle size={11} /> : null}
                        {plan.capacity_flag}
                      </span>
                    )}
                  </div>
                </div>
                {plan.notes && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                    {plan.notes}
                  </div>
                )}
              </div>
            ) : plan ? (
              Array.isArray(plan) ? (
                /* Planner agent returned a recommendation-shape array instead
                 * of {weekly_plan: [...]} — render each item as a priority row
                 * so the user sees a usable plan rather than raw JSON. */
                <div className="curator-recommendations">
                  {plan.map((item: any, idx: number) => {
                    const prioRaw = String(item.priority ?? '').toLowerCase();
                    const prioNum =
                      prioRaw.includes('highest') || prioRaw === '1' ? 1 :
                      prioRaw.includes('high') || prioRaw === '2' ? 2 : 3;
                    const prioClass = prioNum === 1 ? 'prio-1' : prioNum === 2 ? 'prio-2' : 'prio-3';
                    return (
                      <div className="curator-rec-item" key={idx}>
                        <div className={`curator-rec-priority ${prioClass}`}>{idx + 1}</div>
                        <div className="curator-rec-content">
                          <div className="curator-rec-title" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span>{item.title || item.module || item.name || `Step ${idx + 1}`}</span>
                            {Array.isArray(item.sources) && item.sources.length > 0 && (
                              <SourcesPopover sources={item.sources} />
                            )}
                          </div>
                          {(item.cert_code || item.priority) && (
                            <div className="curator-rec-meta">
                              {item.cert_code}
                              {item.cert_code && item.priority ? ' · ' : ''}
                              {item.priority ? `Priority ${item.priority}` : ''}
                            </div>
                          )}
                          {item.reason && <div className="curator-rec-reason">{item.reason}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.6' }}>
                  {typeof plan === 'string' ? plan : JSON.stringify(plan, null, 2)}
                </div>
              )
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <p style={{ marginBottom: '0.75rem' }}>No plan cached yet.</p>
                <button className="btn btn-primary" style={{ fontSize: '0.78rem', background: '#16a34a' }} onClick={handleRefreshPlan}>
                  <Sparkles size={13} /> Build My Study Plan
                </button>
              </div>
            )}
            <div style={{ marginTop: '0.75rem' }}>
              <button className="btn btn-ghost" style={{ fontSize: '0.78rem' }} onClick={() => navigate('/preferences')}>
                <Clock size={13} /> Adjust Preferences
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
