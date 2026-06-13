import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { Skeleton, SkeletonLines } from '../../components/Skeleton';
import {
  ArrowLeft, Briefcase, Award, Wrench, Trash2, Pencil, Save, X, Eye, Edit3, Search,
} from 'lucide-react';

const LEVELS: Record<string, string> = {
  '59': '59 – SDE', '60': '60 – SDE', '61': '61 – SDE II', '62': '62 – SDE II',
  '63': '63 – Senior SDE', '64': '64 – Senior SDE', '65': '65 – Principal SDE',
  '66': '66 – Principal SDE', '67': '67 – Partner SDE', '68': '68 – Distinguished Engineer',
  '69': '69 – Technical Fellow', '70': '70 – Technical Fellow',
};

type EditSection = 'details' | 'courses' | 'skills' | null;

export default function RoleDetail() {
  const { roleId } = useParams();
  const nav = useNavigate();
  const [role, setRole] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<EditSection>(null);
  const [editForm, setEditForm] = useState({ role_name: '', level: '', description: '' });
  const [previewMode, setPreviewMode] = useState(false);
  const [editCourses, setEditCourses] = useState<string[]>([]);
  const [editSkills, setEditSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');

  // For course picker
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [certSearch, setCertSearch] = useState('');

  useEffect(() => {
    apiClient.get(`/api/roles/${roleId}`)
      .then(res => setRole(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
    apiClient.get('/api/courses').then(res => setAllCourses(res.data || [])).catch(console.error);
  }, [roleId]);

  const startEdit = (section: EditSection) => {
    if (!role) return;
    if (section === 'details') {
      setEditForm({ role_name: role.role_name, level: role.level || '', description: role.description || '' });
      setPreviewMode(false);
    } else if (section === 'courses') {
      setEditCourses([...(role.required_courses || [])]);
      setCertSearch('');
    } else if (section === 'skills') {
      setEditSkills((role.required_skills || []).map((s: any) => typeof s === 'string' ? s : s.skill_name || ''));
      setSkillInput('');
    }
    setEditing(section);
  };

  const cancelEdit = () => setEditing(null);

  const saveSection = async (section: EditSection) => {
    if (!role) return;
    setSaving(true);
    try {
      let payload: any = {};
      if (section === 'details') payload = { ...editForm };
      else if (section === 'courses') payload = { required_courses: editCourses };
      else if (section === 'skills') payload = { required_skills: editSkills };
      const res = await apiClient.put(`/api/roles/${roleId}`, payload);
      setRole(res.data);
      setEditing(null);
    } catch (err) {
      console.error('Failed to update:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this role? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/roles/${roleId}`);
      nav('/admin/roles');
    } catch (err) {
      console.error('Failed to delete role:', err);
      setDeleting(false);
    }
  };

  const toggleCourse = (name: string) => {
    setEditCourses(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  };

  const filteredCourses = allCourses.filter(c =>
    c.course_name?.toLowerCase().includes(certSearch.toLowerCase())
  );

  // Simple markdown renderer
  const renderedDescription = useMemo(() => {
    const md = editing === 'details' ? editForm.description : (role?.description || '');
    if (!md) return '';
    const lines = md.split('\n');
    let html = '';
    let inList = false;
    for (const line of lines) {
      if (line.startsWith('# ')) { if (inList) { html += '</ul>'; inList = false; } html += `<h1>${line.slice(2)}</h1>`; }
      else if (line.startsWith('## ')) { if (inList) { html += '</ul>'; inList = false; } html += `<h2>${line.slice(3)}</h2>`; }
      else if (line.startsWith('### ')) { if (inList) { html += '</ul>'; inList = false; } html += `<h3>${line.slice(4)}</h3>`; }
      else if (line.startsWith('- ') || line.startsWith('* ')) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${line.slice(2)}</li>`; }
      else if (line.trim() === '') { if (inList) { html += '</ul>'; inList = false; } html += '<div style="height:0.5rem"></div>'; }
      else { if (inList) { html += '</ul>'; inList = false; } html += `<p>${line}</p>`; }
    }
    if (inList) html += '</ul>';
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    return html;
  }, [role, editing, editForm.description]);

  if (loading) return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/roles')}><ArrowLeft size={18} /> Back to Job Roles</button>
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }} aria-busy="true">
        <Skeleton width="35%" height={22} />
        <div style={{ height: 10 }} />
        <Skeleton width="55%" height={14} />
      </div>
      <div className="card" style={{ padding: '1.5rem' }} aria-busy="true">
        <SkeletonLines count={5} widths={['85%', '78%', '70%', '63%', '55%']} />
      </div>
    </div>
  );
  if (!role) return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/roles')}><ArrowLeft size={18} /> Back to Job Roles</button>
      <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
        <h3>Role not found</h3>
      </div></div>
    </div>
  );

  return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/roles')}>
        <ArrowLeft size={18} /> Back to Job Roles
      </button>

      {/* Details Section */}
      <div className="card course-detail-section">
        <div className="card-header course-detail-section-header">
          <h3><Briefcase size={16} /> Role Details</h3>
          {editing !== 'details' ? (
            <button className="btn btn-ghost btn-sm" onClick={() => startEdit('details')}><Pencil size={14} /> Edit</button>
          ) : (
            <div className="edit-actions">
              <button className="btn btn-primary btn-sm" onClick={() => saveSection('details')} disabled={saving}><Save size={14} /> Save</button>
              <button className="btn btn-ghost btn-sm" onClick={cancelEdit}><X size={14} /></button>
            </div>
          )}
        </div>
        <div className="card-body">
          {editing === 'details' ? (
            <>
              <div className="edit-details-grid">
                <div className="form-field">
                  <label>Role Name</label>
                  <input value={editForm.role_name} onChange={e => setEditForm(f => ({ ...f, role_name: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label>Level</label>
                  <select value={editForm.level} onChange={e => setEditForm(f => ({ ...f, level: e.target.value }))}>
                    <option value="">Select level...</option>
                    {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-field" style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label>Description</label>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button className={`btn btn-ghost btn-xs ${!previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(false)}><Edit3 size={12} /> Write</button>
                    <button className={`btn btn-ghost btn-xs ${previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(true)}><Eye size={12} /> Preview</button>
                  </div>
                </div>
                {previewMode ? (
                  <div className="guidance-preview rendered-md" style={{ height: '200px', overflowY: 'auto', padding: '1rem', border: '1px solid var(--border-primary)', borderRadius: '8px' }}
                    dangerouslySetInnerHTML={{ __html: renderedDescription || '<p style="color:var(--text-muted)">Nothing to preview</p>' }} />
                ) : (
                  <textarea className="guidance-editor" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Markdown description..." style={{ height: '200px', width: '100%', resize: 'none' }} />
                )}
              </div>
            </>
          ) : (
            <>
              <div className="course-detail-title-row">
                <div>
                  {role.level && <span className="profile-role-badge" style={{ marginBottom: '0.5rem', display: 'inline-block' }}>L{role.level} – {LEVELS[role.level]?.split(' – ')[1] || ''}</span>}
                  <h1 className="course-detail-name">{role.role_name}</h1>
                </div>
              </div>
              {role.description ? (
                <div className="rendered-md" style={{ marginTop: '1rem' }} dangerouslySetInnerHTML={{ __html: renderedDescription }} />
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>No description</p>
              )}
              <div className="course-detail-meta" style={{ marginTop: '1rem' }}>
                {role.created_at && <span>Created {new Date(role.created_at).toLocaleDateString()}</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Required Courses Section */}
      <div className="card course-detail-section">
        <div className="card-header course-detail-section-header">
          <h3><Award size={16} /> Required Courses</h3>
          {editing !== 'courses' ? (
            <button className="btn btn-ghost btn-sm" onClick={() => startEdit('courses')}><Pencil size={14} /> Edit</button>
          ) : (
            <div className="edit-actions">
              <button className="btn btn-primary btn-sm" onClick={() => saveSection('courses')} disabled={saving}><Save size={14} /> Save</button>
              <button className="btn btn-ghost btn-sm" onClick={cancelEdit}><X size={14} /></button>
            </div>
          )}
        </div>
        <div className="card-body">
          {editing === 'courses' ? (
            <>
              {editCourses.length > 0 && (
                <div className="tag-list" style={{ marginBottom: '0.75rem' }}>
                  {editCourses.map(name => (
                    <span key={name} className="tag-pill">{name} <X size={12} style={{ cursor: 'pointer' }} onClick={() => toggleCourse(name)} /></span>
                  ))}
                </div>
              )}
              <div className="search-input-wrapper" style={{ marginBottom: '0.75rem' }}>
                <Search size={14} className="search-icon" />
                <input className="search-input" placeholder="Search courses..." value={certSearch} onChange={e => setCertSearch(e.target.value)} />
              </div>
              <div className="cert-toggle-grid">
                {filteredCourses.filter(c => !editCourses.includes(c.course_name)).map(c => (
                  <button key={c.id} className="cert-toggle-pill" onClick={() => toggleCourse(c.course_name)}>
                    <Award size={14} /> {c.course_name}
                  </button>
                ))}
              </div>
            </>
          ) : role.required_courses?.length > 0 ? (
            <div className="tag-list">
              {role.required_courses.map((name: string) => (
                <span key={name} className="profile-skill-tag">{name}</span>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No required courses</p>
          )}
        </div>
      </div>

      {/* Required Skills Section */}
      <div className="card course-detail-section">
        <div className="card-header course-detail-section-header">
          <h3><Wrench size={16} /> Required Skills</h3>
          {editing !== 'skills' ? (
            <button className="btn btn-ghost btn-sm" onClick={() => startEdit('skills')}><Pencil size={14} /> Edit</button>
          ) : (
            <div className="edit-actions">
              <button className="btn btn-primary btn-sm" onClick={() => saveSection('skills')} disabled={saving}><Save size={14} /> Save</button>
              <button className="btn btn-ghost btn-sm" onClick={cancelEdit}><X size={14} /></button>
            </div>
          )}
        </div>
        <div className="card-body">
          {editing === 'skills' ? (
            <>
              {editSkills.length > 0 && (
                <div className="tag-list" style={{ marginBottom: '0.75rem' }}>
                  {editSkills.map(s => (
                    <span key={s} className="tag-pill">{s} <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditSkills(prev => prev.filter(x => x !== s))} /></span>
                  ))}
                </div>
              )}
              <input className="form-inline-input" value={skillInput} onChange={e => setSkillInput(e.target.value)}
                placeholder="Type a skill and press Enter..." style={{ width: '100%' }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = skillInput.trim(); if (v && !editSkills.includes(v)) { setEditSkills(prev => [...prev, v]); } setSkillInput(''); } }} />
            </>
          ) : role.required_skills?.length > 0 ? (
            <div className="tag-list">
              {role.required_skills.map((s: any, i: number) => {
                const name = typeof s === 'string' ? s : s.skill_name || '';
                return <span key={i} className="profile-skill-tag">{name}</span>;
              })}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No required skills</p>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card course-detail-section course-danger-zone">
        <div className="card-header">
          <h3><Trash2 size={16} /> Danger Zone</h3>
        </div>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>Delete this role</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>Once deleted, this role cannot be recovered.</p>
          </div>
          <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            <Trash2 size={15} /> {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
