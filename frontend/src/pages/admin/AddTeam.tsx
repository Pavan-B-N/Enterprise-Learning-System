import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Save, Eye, Edit3 } from 'lucide-react';
import apiClient from '../../api/client';

export default function AddTeam() {
  const nav = useNavigate();
  const [form, setForm] = useState({ team_name: '' });
  const [description, setDescription] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.team_name.trim()) return;
    setSaving(true);
    try {
      await apiClient.post('/api/teams', {
        team_name: form.team_name.trim(),
        description: description,
      });
      nav('/admin/teams');
    } catch (err) {
      console.error('Failed to create team:', err);
    } finally {
      setSaving(false);
    }
  };

  const renderMarkdown = (md: string) => {
    if (!md) return '<p style="color:var(--text-muted)">Nothing to preview</p>';
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
  };

  return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/teams')}>
        <ArrowLeft size={18} /> Back to Teams
      </button>

      <div className="form-page-wrapper">
        <div className="form-page-intro">
          <h1>Create New Team</h1>
          <p>Set up a new team with a name and description.</p>
        </div>

        <div className="card form-card">
          <div className="form-section">
            <div className="form-section-header">
              <Users size={18} />
              <div>
                <h3>Team Information</h3>
                <p>Team name and description</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <label>Team Name <span className="required">*</span></label>
                <input value={form.team_name} onChange={e => setForm({ team_name: e.target.value })} placeholder="e.g. Cloud Engineering" />
              </div>
              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label style={{ margin: 0 }}>Description</label>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button type="button" className={`btn btn-ghost btn-xs ${!previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(false)}><Edit3 size={12} /> Write</button>
                    <button type="button" className={`btn btn-ghost btn-xs ${previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(true)}><Eye size={12} /> Preview</button>
                  </div>
                </div>
                {previewMode ? (
                  <div className="guidance-preview rendered-md" style={{ minHeight: '180px', maxHeight: '300px', overflowY: 'auto', padding: '1rem', border: '1px solid var(--border-primary)', borderRadius: '8px' }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }} />
                ) : (
                  <textarea className="guidance-editor" value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the team's purpose, responsibilities, projects..." style={{ height: '180px', width: '100%', resize: 'vertical' }} />
                )}
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => nav('/admin/teams')}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.team_name.trim()}>
              <Save size={15} /> {saving ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
