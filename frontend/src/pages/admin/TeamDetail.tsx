import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { ArrowLeft, Users, Trash2, Pencil, Save, X, Eye, Edit3 } from 'lucide-react';

export default function TeamDetail() {
  const { teamId } = useParams();
  const nav = useNavigate();
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<'details' | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    apiClient.get(`/api/teams/${teamId}`)
      .then(res => setTeam(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [teamId]);

  const startEdit = () => {
    if (!team) return;
    setEditName(team.team_name || '');
    setEditDesc(team.description || '');
    setPreviewMode(false);
    setEditing('details');
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put(`/api/teams/${teamId}`, {
        team_name: editName,
        description: editDesc,
      });
      setTeam(res.data);
      setEditing(null);
    } catch (err) {
      console.error('Failed to update:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this team? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/teams/${teamId}`);
      nav('/admin/teams');
    } catch (err) {
      console.error('Failed to delete:', err);
      setDeleting(false);
    }
  };

  const renderedDescription = useMemo(() => {
    const md = editing === 'details' ? editDesc : (team?.description || '');
    if (!md) return '';
    let html = '';
    let inList = false;
    for (const line of md.split('\n')) {
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
  }, [team, editing, editDesc]);

  if (loading) return (
    <div aria-busy="true">
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton-shimmer" style={{ width: '35%', height: 24, borderRadius: 6 }} />
        <div style={{ height: 8 }} />
        <div className="skeleton-shimmer" style={{ width: '55%', height: 14, borderRadius: 6 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: '1.25rem' }}>
            <div className="skeleton-shimmer" style={{ width: '60%', height: 16, borderRadius: 6, marginBottom: 12 }} />
            <div className="skeleton-shimmer" style={{ width: '85%', height: 12, borderRadius: 6, marginBottom: 8 }} />
            <div className="skeleton-shimmer" style={{ width: '70%', height: 12, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </div>
  );
  if (!team) return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/teams')}><ArrowLeft size={18} /> Back to Teams</button>
      <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}><h3>Team not found</h3></div></div>
    </div>
  );

  return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/teams')}>
        <ArrowLeft size={18} /> Back to Teams
      </button>

      {/* Details Section */}
      <div className="card course-detail-section">
        <div className="card-header course-detail-section-header">
          <h3><Users size={16} /> Team Details</h3>
          {editing !== 'details' ? (
            <button className="btn btn-ghost btn-sm" onClick={startEdit}><Pencil size={14} /> Edit</button>
          ) : (
            <div className="edit-actions">
              <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}><Save size={14} /> Save</button>
              <button className="btn btn-ghost btn-sm" onClick={cancelEdit}><X size={14} /></button>
            </div>
          )}
        </div>
        <div className="card-body">
          {editing === 'details' ? (
            <>
              <div className="form-field" style={{ marginBottom: '1rem' }}>
                <label>Team Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="form-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ margin: 0 }}>Description</label>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button className={`btn btn-ghost btn-xs ${!previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(false)}><Edit3 size={12} /> Write</button>
                    <button className={`btn btn-ghost btn-xs ${previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(true)}><Eye size={12} /> Preview</button>
                  </div>
                </div>
                {previewMode ? (
                  <div className="guidance-preview rendered-md" style={{ minHeight: '180px', maxHeight: '300px', overflowY: 'auto', padding: '1rem', border: '1px solid var(--border-primary)', borderRadius: '8px' }}
                    dangerouslySetInnerHTML={{ __html: renderedDescription || '<p style="color:var(--text-muted)">Nothing to preview</p>' }} />
                ) : (
                  <textarea className="guidance-editor" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                    placeholder="Markdown description..." style={{ height: '180px', width: '100%', resize: 'vertical' }} />
                )}
              </div>
            </>
          ) : (
            <>
              <h1 className="course-detail-name">{team.team_name}</h1>
              {team.description ? (
                <div className="rendered-md" style={{ marginTop: '1rem' }} dangerouslySetInnerHTML={{ __html: renderedDescription }} />
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>No description</p>
              )}
              <div className="course-detail-meta" style={{ marginTop: '1rem' }}>
                {team.created_at && <span>Created {new Date(team.created_at).toLocaleDateString()}</span>}
              </div>
            </>
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
            <p style={{ fontWeight: 600, fontSize: '0.88rem', margin: 0 }}>Delete this team</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>Once deleted, this team cannot be recovered.</p>
          </div>
          <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            <Trash2 size={15} /> {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
