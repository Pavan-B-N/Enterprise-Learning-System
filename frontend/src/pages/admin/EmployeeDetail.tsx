import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Shield, Save, Trash2, Pencil, ChevronDown, Mail, Briefcase, Users, BookOpen, TrendingUp, Award } from 'lucide-react';
import apiClient from '../../api/client';
import { Skeleton, SkeletonLines } from '../../components/Skeleton';

export default function EmployeeDetail() {
  const { userId } = useParams();
  const nav = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role: 'learner',
    job_role: '',
    job_role_name: '',
    reports_to: '',
    reports_to_name: '',
  });

  // Dropdown data
  const [roles, setRoles] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [roleSearch, setRoleSearch] = useState('');
  const [managerSearch, setManagerSearch] = useState('');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [managerDropdownOpen, setManagerDropdownOpen] = useState(false);
  const [progress, setProgress] = useState<any[]>([]);

  useEffect(() => {
    apiClient.get(`/api/admin/users/${userId}`)
      .then(res => {
        const u = res.data;
        setUser(u);
        setForm({
          full_name: u.full_name || '',
          email: u.email || '',
          role: u.role || 'learner',
          job_role: u.job_role || '',
          job_role_name: u.job_role_name || u.job_title || '',
          reports_to: u.reports_to || '',
          reports_to_name: u.reports_to_name || '',
        });
      })
      .catch(() => setError('User not found'))
      .finally(() => setLoading(false));

    apiClient.get(`/api/admin/users/${userId}/progress`)
      .then(res => setProgress(res.data || []))
      .catch(() => {});

    apiClient.get('/api/roles').then(res => setRoles(res.data || [])).catch(console.error);
    apiClient.get('/api/admin/users').then(res => {
      const all = res.data || [];
      setManagers(all.filter((e: any) => e.role === 'manager'));
    }).catch(console.error);
  }, [userId]);

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.email.trim()) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const res = await apiClient.put(`/api/admin/users/${userId}`, {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        role: form.role,
        job_role: form.job_role || null,
        job_title: form.job_role_name || null,
        reports_to: form.reports_to || null,
      });
      setUser(res.data);
      setEditing(false);
      setSuccess('User updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError('Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/admin/users/${userId}`);
      nav('/admin/employees');
    } catch {
      setError('Failed to delete user');
      setDeleting(false);
    }
  };

  const startEdit = () => {
    setForm({
      full_name: user.full_name || '',
      email: user.email || '',
      role: user.role || 'learner',
      job_role: user.job_role || '',
      job_role_name: user.job_role_name || user.job_title || '',
      reports_to: user.reports_to || '',
      reports_to_name: user.reports_to_name || '',
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError('');
  };

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const filteredRoles = roles.filter(r =>
    (r.role_name || '').toLowerCase().includes(roleSearch.toLowerCase())
  );
  const filteredManagers = managers.filter(e =>
    (e.full_name || '').toLowerCase().includes(managerSearch.toLowerCase())
  );

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return { bg: '#eef2ff', text: '#4f46e5' };
      case 'manager': return { bg: '#f0fdf4', text: '#16a34a' };
      default: return { bg: '#f8fafc', text: '#64748b' };
    }
  };

  if (loading) return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/employees')}><ArrowLeft size={18} /> Back to Employees</button>
      <div className="card" style={{ padding: '2rem', display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1.25rem' }} aria-busy="true">
        <Skeleton width={64} height={64} radius={32} />
        <div style={{ flex: 1 }}>
          <Skeleton width="40%" height={22} />
          <div style={{ height: 10 }} />
          <Skeleton width="60%" height={14} />
        </div>
      </div>
      <div className="card" style={{ padding: '1.5rem' }} aria-busy="true">
        <SkeletonLines count={5} widths={['85%', '78%', '70%', '63%', '55%']} />
      </div>
    </div>
  );
  if (!user && error) return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/employees')}><ArrowLeft size={18} /> Back to Users</button>
      <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
        <h3>User not found</h3>
      </div>
    </div>
  );

  const rc = getRoleColor(user.role);

  return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/employees')}>
        <ArrowLeft size={18} /> Back to Users
      </button>

      <div className={editing ? 'form-page-wrapper' : 'employee-detail-wrapper'}>
        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.5rem', color: '#16a34a', fontSize: '0.85rem' }}>
            {success}
          </div>
        )}

        {!editing ? (
          /* ─── View Mode ─── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Profile Header Card */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)', padding: '2.5rem 2rem 2rem', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', border: '3px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {(user.full_name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h1 style={{ margin: 0, color: 'white', fontSize: '1.5rem', fontWeight: 700 }}>{user.full_name}</h1>
                    <p style={{ margin: '0.3rem 0 0', color: 'rgba(255,255,255,0.75)', fontSize: '0.88rem' }}>{user.job_role_name || user.job_title || 'No role assigned'}</p>
                  </div>
                  <button className="btn" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(4px)' }} onClick={startEdit}>
                    <Pencil size={14} /> Edit
                  </button>
                </div>
              </div>

              {/* Details Grid */}
              <div style={{ padding: '1.5rem 2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Mail size={12} /> Email</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{user.email}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Shield size={12} /> Access Role</div>
                  <span style={{ background: rc.bg, color: rc.text, padding: '0.2rem 0.65rem', borderRadius: '0.3rem', fontSize: '0.78rem', fontWeight: 600, textTransform: 'capitalize' }}>
                    {user.role}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Briefcase size={12} /> Job Role</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{user.job_role_name || user.job_title || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Users size={12} /> Reports To</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{user.reports_to_name || '—'}</div>
                </div>
              </div>
            </div>

            {/* Learning Progress Card */}
            {progress.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <BookOpen size={16} style={{ color: 'var(--accent-primary)' }} /> Learning Progress
                  </h3>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  {/* Summary stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ padding: '1rem 1.25rem', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>{progress.filter(p => p.status === 'completed').length}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Completed</div>
                    </div>
                    <div style={{ padding: '1rem 1.25rem', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>{progress.filter(p => p.status === 'in_progress').length}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>In Progress</div>
                    </div>
                    <div style={{ padding: '1rem 1.25rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{Math.round(progress.reduce((s, p) => s + (p.percent_complete || 0), 0) / progress.length)}%</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Avg Progress</div>
                    </div>
                  </div>
                  {/* Course list */}
                  <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {progress.map((p: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', borderBottom: i < progress.length - 1 ? '1px solid var(--surface-2)' : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.course_name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                            {p.modules_completed?.length || 0}/{p.total_modules || 0} modules
                          </div>
                        </div>
                        <div style={{ width: 100, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${p.percent_complete || 0}%`, height: '100%', background: p.status === 'completed' ? '#22c55e' : '#6366f1', borderRadius: 3, transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', minWidth: 30, textAlign: 'right' }}>{p.percent_complete}%</span>
                        </div>
                        <span className={`badge ${p.status === 'completed' ? 'completed' : p.status === 'in_progress' ? 'in-progress' : 'not-started'}`} style={{ fontSize: '0.68rem', flexShrink: 0 }}>
                          {p.status === 'completed' ? 'Done' : p.status === 'in_progress' ? 'Active' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Danger Zone */}
            <div className="card" style={{ border: '1px solid #fecaca' }}>
              <div style={{ padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.82rem', margin: 0, color: '#dc2626' }}>Danger Zone</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.15rem 0 0' }}>Permanently delete this user and all associated data.</p>
                </div>
                <button className="btn" style={{ background: '#dc2626', color: 'white', border: 'none', fontSize: '0.78rem' }} onClick={handleDelete} disabled={deleting}>
                  <Trash2 size={13} /> {deleting ? 'Deleting...' : 'Delete User'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ─── Edit Mode ─── */
          <div className="card form-card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}><Pencil size={16} /> Edit User</h3>
            </div>

            <div className="card-body">
              {/* Personal Info */}
              <div className="form-section">
                <div className="form-section-header">
                  <User size={18} />
                  <div>
                    <h3>Personal Information</h3>
                    <p>Name and email</p>
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-field">
                    <label>Full Name <span className="required">*</span></label>
                    <input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="John Doe" />
                  </div>
                  <div className="form-field">
                    <label>Email Address <span className="required">*</span></label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@els.dev" />
                  </div>
                </div>
              </div>

              {/* Role & Assignment */}
              <div className="form-section">
                <div className="form-section-header">
                  <Shield size={18} />
                  <div>
                    <h3>Role & Assignment</h3>
                    <p>Access level, job role, and reporting manager</p>
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-field">
                    <label>Access Role</label>
                    <select value={form.role} onChange={e => set('role', e.target.value)}>
                      <option value="learner">Learner</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  {/* Job Role dropdown */}
                  <div className="form-field" style={{ position: 'relative' }}>
                    <label>Job Role</label>
                    <div className="dropdown-input-wrapper" onClick={() => setRoleDropdownOpen(true)}>
                      <input
                        value={roleDropdownOpen ? roleSearch : form.job_role_name}
                        placeholder="Select a job role..."
                        onFocus={() => { setRoleDropdownOpen(true); setRoleSearch(''); }}
                        onBlur={() => setTimeout(() => setRoleDropdownOpen(false), 200)}
                        onChange={e => setRoleSearch(e.target.value)}
                      />
                      <ChevronDown size={14} className="dropdown-chevron" />
                    </div>
                    {roleDropdownOpen && (
                      <div className="search-dropdown">
                        {filteredRoles.length > 0 ? filteredRoles.map(r => (
                          <div key={r.id || r._id} className="search-dropdown-item"
                            onMouseDown={() => {
                              setForm(prev => ({
                                ...prev,
                                job_role: r.id || r._id || '',
                                job_role_name: r.role_name || '',
                              }));
                              setRoleSearch('');
                              setRoleDropdownOpen(false);
                            }}>
                            <span>{r.role_name}</span>
                            {r.level && <span className="dropdown-item-badge">{r.level}</span>}
                          </div>
                        )) : (
                          <div className="search-dropdown-empty">No roles found</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Reports To dropdown */}
                  <div className="form-field" style={{ position: 'relative' }}>
                    <label>Reports To</label>
                    <div className="dropdown-input-wrapper" onClick={() => setManagerDropdownOpen(true)}>
                      <input
                        value={managerDropdownOpen ? managerSearch : form.reports_to_name}
                        placeholder="Select a manager..."
                        onFocus={() => { setManagerDropdownOpen(true); setManagerSearch(''); }}
                        onBlur={() => setTimeout(() => setManagerDropdownOpen(false), 200)}
                        onChange={e => setManagerSearch(e.target.value)}
                      />
                      <ChevronDown size={14} className="dropdown-chevron" />
                    </div>
                    {managerDropdownOpen && (
                      <div className="search-dropdown">
                        {filteredManagers.length > 0 ? filteredManagers.map(e => (
                          <div key={e.id || e._id || e.email} className="search-dropdown-item"
                            onMouseDown={() => {
                              setForm(prev => ({
                                ...prev,
                                reports_to: e.id || e._id || '',
                                reports_to_name: e.full_name || '',
                              }));
                              setManagerSearch('');
                              setManagerDropdownOpen(false);
                            }}>
                            <div>
                              <span style={{ fontWeight: 500 }}>{e.full_name}</span>
                              <span className="dropdown-item-badge">{e.role}</span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{e.email}</div>
                          </div>
                        )) : (
                          <div className="search-dropdown-empty">No managers found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="form-actions">
                <button className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.full_name.trim() || !form.email.trim()}>
                  <Save size={15} /> {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
