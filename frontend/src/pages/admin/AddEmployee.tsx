import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Shield, Save, Search, ChevronDown } from 'lucide-react';
import apiClient from '../../api/client';

export default function AddEmployee() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role: 'learner',
    job_role: '',
    job_role_name: '',
    reports_to: '',
    reports_to_name: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Data for dropdowns
  const [roles, setRoles] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [roleSearch, setRoleSearch] = useState('');
  const [managerSearch, setManagerSearch] = useState('');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [managerDropdownOpen, setManagerDropdownOpen] = useState(false);

  const roleRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.get('/api/roles').then(res => setRoles(res.data || [])).catch(console.error);
    apiClient.get('/api/admin/users').then(res => {
      const all = res.data || [];
      setManagers(all.filter((e: any) => e.role === 'manager'));
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.email.trim()) return;
    setError('');
    setSaving(true);
    try {
      await apiClient.post('/api/admin/users', {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        role: form.role,
        job_role: form.job_role || null,
        job_title: form.job_role_name || null,
        reports_to: form.reports_to || null,
      });
      nav('/admin/employees');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to add employee. Please try again.');
      console.error('Failed to add employee:', err);
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const filteredRoles = roles.filter(r =>
    (r.role_name || '').toLowerCase().includes(roleSearch.toLowerCase())
  );

  const filteredManagers = managers.filter(e =>
    (e.full_name || '').toLowerCase().includes(managerSearch.toLowerCase())
  );

  return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/employees')}>
        <ArrowLeft size={18} /> Back to Users
      </button>

      <div className="form-page-wrapper">
        <div className="form-page-intro">
          <h1>Add New User</h1>
          <p>Register a new user in the learning system. A default password will be assigned automatically.</p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#dc2626', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div className="card form-card">
          {/* Section: Personal Info */}
          <div className="form-section">
            <div className="form-section-header">
              <User size={18} />
              <div>
                <h3>Personal Information</h3>
                <p>Basic identity details</p>
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

          {/* Section: Role & Assignment */}
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

              {/* Job Role - searchable dropdown */}
              <div className="form-field" ref={roleRef} style={{ position: 'relative' }}>
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

              {/* Reports To - managers only */}
              <div className="form-field" ref={managerRef} style={{ position: 'relative' }}>
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
            <button className="btn btn-ghost" onClick={() => nav('/admin/employees')}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.full_name.trim() || !form.email.trim()}>
              <Save size={15} /> {saving ? 'Saving...' : 'Add User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
