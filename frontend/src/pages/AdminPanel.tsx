import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuthStore } from '../store/authStore';
import {
  Users, Award, Plus, Shield, BookOpen, Briefcase,
  Pencil, Save, X, Search, TrendingUp,
  AlertTriangle, Trophy, GraduationCap,
} from 'lucide-react';
import { Skeleton, SkeletonLines, SkeletonStatGrid, SkeletonCourseGrid, SkeletonTableRows } from '../components/Skeleton';

export default function AdminPanel() {
  const location = useLocation();
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.get('/api/admin/users'),
    ])
      .then(([u]) => { setUsers(u.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Determine which tab to show based on route
  const path = location.pathname;
  const tab = path.includes('/admin/employees') ? 'employees'
    : path.includes('/admin/certifications') ? 'certifications'
    : path.includes('/admin/roles') ? 'roles'
    : path.includes('/admin/courses') ? 'courses'
    : 'overview';

  return (
    <div>
      {tab === 'overview' && <OverviewTab stats={stats} users={users} loading={loading} />}
      {tab === 'employees' && <EmployeesTab users={users} setUsers={setUsers} loading={loading} />}
      {tab === 'certifications' && <CertsTab />}
      {tab === 'courses' && <CoursesTab />}
      {tab === 'roles' && <RolesTab />}
    </div>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem',
  fontSize: '0.82rem', background: 'var(--bg-input)', outline: 'none', width: '100%',
};

// ─── Overview Tab ───────────────────────────────────────────────────────

function OverviewTab({ stats, users, loading: parentLoading }: { stats: any; users: any[]; loading?: boolean }) {
  const nav = useNavigate();
  const [dashboard, setDashboard] = useState<any>(null);
  const [loadingDash, setLoadingDash] = useState(true);

  useEffect(() => {
    apiClient.get('/api/admin/dashboard/stats')
      .then(res => setDashboard(res.data))
      .catch(console.error)
      .finally(() => setLoadingDash(false));
  }, []);

  const isLoading = parentLoading || loadingDash;
  const d = dashboard || {};

  const statCards = [
    { label: 'Total Learners', value: d.total_learners ?? 0, icon: Users, color: '#6366f1' },
    { label: 'Total Courses', value: d.total_courses ?? 0, icon: BookOpen, color: '#0ea5e9' },
    { label: 'Avg Completion', value: `${d.avg_completion ?? 0}%`, icon: TrendingUp, color: '#22c55e' },
    { label: 'Certifications Issued', value: d.total_certs_issued ?? 0, icon: Award, color: '#f59e0b' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        <div onClick={() => nav('/admin/employees/add')} className="card" style={{ padding: '1.25rem', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--border)' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}>
          <div style={{ width: 40, height: 40, borderRadius: '10px', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <Users size={20} style={{ color: '#6366f1' }} />
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.25rem' }}>Add User</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Create a new learner or admin account</div>
        </div>
        <div onClick={() => nav('/admin/courses/add')} className="card" style={{ padding: '1.25rem', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--border)' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = '#0ea5e9'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}>
          <div style={{ width: 40, height: 40, borderRadius: '10px', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <BookOpen size={20} style={{ color: '#0ea5e9' }} />
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.25rem' }}>Add Course</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Create a course with modules & topics</div>
        </div>
        <div onClick={() => nav('/admin/roles/add')} className="card" style={{ padding: '1.25rem', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--border)' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}>
          <div style={{ width: 40, height: 40, borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <Briefcase size={20} style={{ color: '#22c55e' }} />
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.25rem' }}>Add Job Role</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Define role with required courses</div>
        </div>
      </div>

      {/* Stat Cards */}
      {isLoading ? (
        <SkeletonStatGrid count={4} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {statCards.map((s, i) => (
            <div key={i} className="card" style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>{s.label}</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: '12px', background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <s.icon size={22} style={{ color: s.color }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Middle: Top courses + Recent activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Top Courses */}
        <div className="card">
          <div className="card-header"><h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Trophy size={16} style={{ color: '#f59e0b' }} /> Top Courses by Completion</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            {isLoading ? (
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead><tr><th>#</th><th>Course</th><th>Completions</th></tr></thead>
                <tbody><SkeletonTableRows rows={4} cols={3} colWidths={['10%', '70%', '30%']} /></tbody>
              </table>
            ) : (d.top_courses || []).length > 0 ? (
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead><tr><th>#</th><th>Course</th><th>Completions</th></tr></thead>
                <tbody>
                  {(d.top_courses || []).map((c: any, i: number) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{i + 1}</td>
                      <td>{c.course_name}</td>
                      <td><span className="badge completed">{c.completions}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>No completions yet</div>
            )}
          </div>
        </div>

        {/* Top Performers */}
        <div className="card">
          <div className="card-header"><h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Award size={16} style={{ color: '#8b5cf6' }} /> Top Performers</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            {isLoading ? (
              <div style={{ padding: '1rem' }} aria-busy="true">
                <SkeletonLines count={4} widths={['85%', '75%', '90%', '70%']} />
              </div>
            ) : (d.top_performers || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(d.top_performers || []).map((p: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--surface-2)', fontSize: '0.8rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: i === 0 ? '#fef3c7' : i === 1 ? '#f1f5f9' : i === 2 ? '#fef2f2' : 'var(--surface-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', color: i === 0 ? '#d97706' : i === 1 ? '#64748b' : i === 2 ? '#dc2626' : 'var(--accent-primary)', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{p.user_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{p.courses_completed}/{p.total_enrolled} courses completed</div>
                    </div>
                    <span className="badge completed" style={{ fontSize: '0.72rem' }}>
                      {p.courses_completed} done
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>No completions yet</div>
            )}
          </div>
        </div>
      </div>

      {/* At-risk learners */}
      <div className="card">
        <div className="card-header"><h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={16} style={{ color: '#ef4444' }} /> At-Risk Learners <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-tertiary)' }}>(inactive &gt; 14 days)</span></h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          {isLoading ? (
            <table className="data-table" style={{ fontSize: '0.82rem' }}>
              <thead><tr><th>Learner</th><th>Course</th><th>Progress</th><th>Last Active</th></tr></thead>
              <tbody><SkeletonTableRows rows={5} cols={4} colWidths={['25%', '40%', '20%', '20%']} /></tbody>
            </table>
          ) : (d.at_risk_learners || []).length > 0 ? (
            <table className="data-table" style={{ fontSize: '0.82rem' }}>
              <thead><tr><th>Learner</th><th>Course</th><th>Progress</th><th>Last Active</th></tr></thead>
              <tbody>
                {(d.at_risk_learners || []).map((a: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{a.user_name}</td>
                    <td>{a.course_name}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden', maxWidth: 80 }}>
                          <div style={{ width: `${a.percent_complete}%`, height: '100%', background: a.percent_complete > 50 ? '#f59e0b' : '#ef4444', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{a.percent_complete}%</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{a.last_activity ? new Date(a.last_activity).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
              <GraduationCap size={28} style={{ opacity: 0.3, margin: '0 auto 0.5rem' }} />
              <div>All learners are on track!</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ──────────────────────────────────────────────────────────

function EmployeesTab({ users, setUsers, loading }: { users: any[]; setUsers: (u: any[]) => void; loading?: boolean }) {
  const nav = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');

  const filtered = users.filter((u) => {
    // Hide the currently signed-in user
    if (currentUser && (u.id === currentUser.id || u._id === currentUser.id)) return false;
    return u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.job_title?.toLowerCase().includes(search.toLowerCase());
  });

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return { bg: '#eef2ff', text: '#4f46e5' };
      case 'manager': return { bg: '#f0fdf4', text: '#16a34a' };
      default: return { bg: '#f8fafc', text: '#64748b' };
    }
  };

  return (
    <div>
      <div className="list-header">
        <div className="list-header-left">
          <div className="search-input-wrapper" style={{ minWidth: '260px' }}>
            <Search size={15} className="search-icon" />
            <input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, or role..." disabled={loading} />
          </div>
          <span className="list-count">{loading ? 'Loading…' : `${filtered.length} users`}</span>
        </div>
        <button className="btn btn-primary" onClick={() => nav('/admin/employees/add')}><Plus size={15} /> Add User</button>
      </div>

      {loading ? (
        <div className="employee-card-grid" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="employee-card">
              <div className="employee-card-header">
                <div className="employee-avatar" style={{ background: 'var(--surface-2)' }}>&nbsp;</div>
                <Skeleton width={60} height={20} radius={10} />
              </div>
              <div className="employee-card-body">
                <Skeleton width="70%" height={16} />
                <div style={{ height: 6 }} />
                <Skeleton width="85%" height={12} />
                <div style={{ height: 6 }} />
                <Skeleton width="50%" height={12} />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="employee-card-grid">
          {filtered.map((u, i) => {
            const rc = getRoleColor(u.role);
            return (
              <div key={u.id || u._id || i} className="employee-card" onClick={() => nav(`/admin/employees/${u.id || u._id}`)}>
                <div className="employee-card-header">
                  <div className="employee-avatar">
                    {(u.full_name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <span className="employee-role-badge" style={{ background: rc.bg, color: rc.text }}>
                    {u.role}
                  </span>
                </div>
                <div className="employee-card-body">
                  <h4 className="employee-name">{u.full_name || 'Unknown'}</h4>
                  <p className="employee-email">{u.email}</p>
                  {u.job_title && <p className="employee-jobtitle">{u.job_title}</p>}
                  {(u.reports_to_name || u.reports_to) && (
                    <p className="employee-reports-to">
                      <span>Reports to:</span> {u.reports_to_name || u.reports_to}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <Users size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{search ? 'No matching employees' : 'No employees yet'}</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{search ? 'Try a different search term.' : 'Add your first employee to get started.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Certifications Tab ─────────────────────────────────────────────────

function CertsTab() {
  const nav = useNavigate();
  const [certs, setCerts] = useState([
    { cert_id: 'CERT-AZ900', cert_name: 'Azure Fundamentals', level: 'fundamentals', pass_threshold: 70, recommended_hours: 30 },
    { cert_id: 'CERT-AZ104', cert_name: 'Azure Administrator', level: 'associate', pass_threshold: 70, recommended_hours: 50 },
    { cert_id: 'CERT-AZ204', cert_name: 'Azure Developer Associate', level: 'associate', pass_threshold: 70, recommended_hours: 60 },
    { cert_id: 'CERT-AZ400', cert_name: 'DevOps Engineer Expert', level: 'expert', pass_threshold: 70, recommended_hours: 80 },
    { cert_id: 'CERT-AZ305', cert_name: 'Azure Solutions Architect Expert', level: 'expert', pass_threshold: 70, recommended_hours: 90 },
    { cert_id: 'CERT-AZ500', cert_name: 'Azure Security Engineer', level: 'associate', pass_threshold: 70, recommended_hours: 60 },
    { cert_id: 'CERT-DP203', cert_name: 'Azure Data Engineer', level: 'associate', pass_threshold: 70, recommended_hours: 70 },
    { cert_id: 'CERT-AI102', cert_name: 'Azure AI Engineer', level: 'associate', pass_threshold: 70, recommended_hours: 60 },
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ cert_id: '', cert_name: '', level: 'associate', pass_threshold: 70, recommended_hours: 40 });

  const startEdit = (c: any) => { setEditingId(c.cert_id); setForm({ ...c }); };

  const saveEdit = () => {
    setCerts(certs.map(c => c.cert_id === editingId ? { ...form } : c));
    setEditingId(null);
  };

  return (
    <div>
      <div className="list-header">
        <span className="list-count">{certs.length} certifications configured</span>
        <button className="btn btn-primary" onClick={() => nav('/admin/certifications/add')}><Plus size={15} /> Add Certification</button>
      </div>

      {editingId && (
        <div className="card" style={{ marginBottom: '1rem', border: '1.5px solid var(--accent-primary)' }}>
          <div className="card-header"><h3><Pencil size={16} /> Edit Certification</h3></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Cert ID</label>
                <input style={inputStyle} value={form.cert_id} onChange={e => setForm({ ...form, cert_id: e.target.value })} placeholder="CERT-XXX" />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Name *</label>
                <input style={inputStyle} value={form.cert_name} onChange={e => setForm({ ...form, cert_name: e.target.value })} placeholder="Certification name" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Level</label>
                <select style={inputStyle} value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}>
                  <option value="fundamentals">Fundamentals</option>
                  <option value="associate">Associate</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Hours</label>
                <input type="number" style={inputStyle} value={form.recommended_hours} onChange={e => setForm({ ...form, recommended_hours: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Pass %</label>
                <input type="number" style={inputStyle} value={form.pass_threshold} onChange={e => setForm({ ...form, pass_threshold: parseInt(e.target.value) || 70 })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEditingId(null)}><X size={14} /> Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit}><Save size={14} /> Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data-table">
            <thead><tr><th>ID</th><th>Name</th><th>Level</th><th>Hours</th><th>Pass %</th><th>Actions</th></tr></thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.cert_id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{c.cert_id}</td>
                  <td style={{ fontWeight: 500 }}>{c.cert_name}</td>
                  <td><span className={`badge ${c.level === 'expert' ? 'completed' : c.level === 'associate' ? 'in-progress' : 'not-started'}`}>{c.level}</span></td>
                  <td>{c.recommended_hours}h</td>
                  <td>{c.pass_threshold}%</td>
                  <td>
                    <button className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem' }} onClick={() => startEdit(c)}>
                      <Pencil size={12} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Courses Tab ────────────────────────────────────────────────────────

function CoursesTab() {
  const nav = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiClient.get('/api/courses')
      .then(res => setCourses(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = courses.filter(c =>
    c.course_name?.toLowerCase().includes(search.toLowerCase())
  );

  const diffColor = (d: string) => {
    switch (d) {
      case 'beginner': return 'not-started';
      case 'intermediate': return 'in-progress';
      case 'advanced': return 'completed';
      default: return '';
    }
  };

  if (loading) return (
    <div>
      <div className="courses-actions-bar">
        <div className="search-input-wrapper">
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)} disabled />
        </div>
        <button className="btn btn-primary" onClick={() => nav('/admin/courses/add')}><Plus size={15} /> Add Course</button>
      </div>
      <SkeletonCourseGrid count={6} />
    </div>
  );

  return (
    <div>
      <div className="courses-actions-bar">
        <div className="search-input-wrapper">
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => nav('/admin/courses/add')}><Plus size={15} /> Add Course</button>
      </div>

      {filtered.length > 0 ? (
        <div className="course-card-grid">
          {filtered.map((c) => (
            <div key={c.id} className="course-card" onClick={() => nav(`/admin/courses/${c.id}`)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <h3 className="course-card-title" style={{ margin: 0 }}>{c.course_name}</h3>
                <span className={`difficulty-badge ${diffColor(c.difficulty)}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{c.difficulty}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>
                {c.duration_hours}h &middot; {c.modules?.length || 0} modules
              </div>
              {c.certification && (
                <div style={{ fontSize: '0.78rem', color: 'var(--accent-primary)', marginTop: '0.4rem', fontWeight: 500 }}>
                  <Award size={13} style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />{c.certification.cert_code || c.certification.official_cert_name}
                </div>
              )}
              {c.modules?.length > 0 && (
                <div className="course-card-modules">
                  {c.modules.slice(0, 3).map((m: any, i: number) => (
                    <div key={i} className="course-card-module-item">
                      <span className="course-card-module-num">{i + 1}</span>
                      <span>{m.title || m.module_name}</span>
                    </div>
                  ))}
                  {c.modules.length > 3 && (
                    <div className="course-card-module-more">+{c.modules.length - 3} more modules</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <BookOpen size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{search ? 'No matching courses' : 'No courses yet'}</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{search ? 'Try a different search term.' : 'Create your first course to get started.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Roles Tab ──────────────────────────────────────────────────────────

const LEVELS: Record<string, string> = {
  '59': 'SDE', '60': 'SDE', '61': 'SDE II', '62': 'SDE II',
  '63': 'Senior SDE', '64': 'Senior SDE', '65': 'Principal SDE',
  '66': 'Principal SDE', '67': 'Partner SDE', '68': 'Distinguished Engineer',
  '69': 'Technical Fellow', '70': 'Technical Fellow',
};

function RolesTab() {
  const nav = useNavigate();
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiClient.get('/api/roles')
      .then(res => setRoles(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = roles.filter(r =>
    r.role_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div>
      <div className="courses-actions-bar">
        <div className="search-input-wrapper">
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search roles..." value={search} onChange={e => setSearch(e.target.value)} disabled />
        </div>
        <button className="btn btn-primary" onClick={() => nav('/admin/roles/add')}><Plus size={15} /> Add Role</button>
      </div>
      <SkeletonCourseGrid count={6} />
    </div>
  );

  return (
    <div>
      <div className="courses-actions-bar">
        <div className="search-input-wrapper">
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search roles..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => nav('/admin/roles/add')}><Plus size={15} /> Add Role</button>
      </div>

      {filtered.length > 0 ? (
        <div className="course-card-grid">
          {filtered.map((r) => (
            <div key={r.id} className="course-card" onClick={() => nav(`/admin/roles/${r.id}`)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <h3 className="course-card-title" style={{ margin: 0 }}>{r.role_name}</h3>
                {r.level && <span className="difficulty-badge intermediate" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>L{r.level} – {LEVELS[r.level] || ''}</span>}
              </div>
              {r.required_courses?.length > 0 && (
                <div className="course-card-modules">
                  {r.required_courses.slice(0, 3).map((name: string, i: number) => (
                    <div key={i} className="course-card-module-item">
                      <span className="course-card-module-num">{i + 1}</span>
                      <span>{name}</span>
                    </div>
                  ))}
                  {r.required_courses.length > 3 && (
                    <div className="course-card-module-more">+{r.required_courses.length - 3} more</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <Briefcase size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{search ? 'No matching roles' : 'No roles yet'}</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{search ? 'Try a different search term.' : 'Create your first job role to get started.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
