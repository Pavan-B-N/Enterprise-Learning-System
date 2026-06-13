import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { ArrowLeft, Briefcase, Award, Wrench, Save, X, FileText, Eye, Edit3, Search, Plus } from 'lucide-react';

export default function AddRole() {
  const nav = useNavigate();
  const [form, setForm] = useState({ role_name: '', level: '' });
  const [descriptionMd, setDescriptionMd] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch courses for searchable certification picker
  const [courses, setCourses] = useState<any[]>([]);
  const [certSearch, setCertSearch] = useState('');
  const [certDropdownOpen, setCertDropdownOpen] = useState(false);

  // Fetch skills for searchable skill picker
  const [allSkills, setAllSkills] = useState<any[]>([]);
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);

  useEffect(() => {
    apiClient.get('/api/courses')
      .then(res => setCourses(res.data || []))
      .catch(console.error);
    apiClient.get('/api/skills')
      .then(res => setAllSkills(res.data || []))
      .catch(console.error);
  }, []);

  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const toggleCourse = (name: string) => {
    setSelectedCourses(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
    setCertSearch('');
    setCertDropdownOpen(false);
  };

  const addSkill = async (value?: string) => {
    const v = (value || skillInput).trim();
    if (!v || skills.includes(v)) { setSkillInput(''); return; }
    // Create skill in DB (returns existing if already exists)
    try {
      const res = await apiClient.post('/api/skills', { name: v });
      const created = res.data;
      if (!allSkills.find(s => s.name === created.name)) {
        setAllSkills(prev => [...prev, created]);
      }
    } catch { /* skill already exists or network issue, still add locally */ }
    setSkills(prev => [...prev, v]);
    setSkillInput('');
    setSkillDropdownOpen(false);
  };

  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSkill();
    }
  };

  const filteredSkills = allSkills.filter(s =>
    s.name?.toLowerCase().includes(skillInput.toLowerCase()) && !skills.includes(s.name)
  );

  const filteredCourses = courses.filter(c =>
    c.course_name?.toLowerCase().includes(certSearch.toLowerCase()) && !selectedCourses.includes(c.course_name)
  );
  const renderedDescription = useMemo(() => {
    if (!descriptionMd) return '';
    const lines = descriptionMd.split('\n');
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
  }, [descriptionMd]);

  const handleSave = async () => {
    if (!form.role_name.trim()) return;
    setSaving(true);
    try {
      await apiClient.post('/api/roles', {
        role_name: form.role_name.trim(),
        level: form.level,
        description: descriptionMd,
        required_courses: selectedCourses,
        required_skills: skills,
      });
      nav('/admin/roles');
    } catch (err) {
      console.error('Failed to create role:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/admin/roles')}>
        <ArrowLeft size={18} /> Back to Job Roles
      </button>

      <div className="form-page-wrapper">
        <div className="form-page-intro">
          <h1>Add Job Role</h1>
          <p>Define a new role with required courses and skills.</p>
        </div>

        <div className="card form-card">
          {/* Role Details */}
          <div className="form-section">
            <div className="form-section-header">
              <Briefcase size={18} />
              <div>
                <h3>Role Details</h3>
                <p>Name, level, and description for this job role</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>Role Name <span className="required">*</span></label>
                <input value={form.role_name} onChange={e => set('role_name', e.target.value)} placeholder="e.g. SDE1 Azure Dev" />
              </div>
              <div className="form-field">
                <label>Level <span className="required">*</span></label>
                <select value={form.level} onChange={e => set('level', e.target.value)}>
                  <option value="">Select level...</option>
                  <option value="59">59 – SDE</option>
                  <option value="60">60 – SDE</option>
                  <option value="61">61 – SDE II</option>
                  <option value="62">62 – SDE II</option>
                  <option value="63">63 – Senior SDE</option>
                  <option value="64">64 – Senior SDE</option>
                  <option value="65">65 – Principal SDE</option>
                  <option value="66">66 – Principal SDE</option>
                  <option value="67">67 – Partner SDE</option>
                  <option value="68">68 – Distinguished Engineer</option>
                  <option value="69">69 – Technical Fellow</option>
                  <option value="70">70 – Technical Fellow</option>
                </select>
              </div>
            </div>

            {/* Markdown description */}
            <div className="form-field" style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label>Description</label>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <button className={`btn btn-ghost btn-xs ${!previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(false)}><Edit3 size={12} /> Write</button>
                  <button className={`btn btn-ghost btn-xs ${previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(true)}><Eye size={12} /> Preview</button>
                </div>
              </div>
              {previewMode ? (
                <div className="guidance-preview rendered-md" style={{ height: '240px', overflowY: 'auto', padding: '1rem', border: '1px solid var(--border-primary)', borderRadius: '8px' }}
                  dangerouslySetInnerHTML={{ __html: renderedDescription || '<p style="color:var(--text-muted)">Nothing to preview</p>' }} />
              ) : (
                <textarea className="guidance-editor" value={descriptionMd} onChange={e => setDescriptionMd(e.target.value)}
                  placeholder="Describe the role responsibilities, expectations, and growth path... (Markdown supported)"
                  style={{ height: '240px', width: '100%', resize: 'none' }} />
              )}
            </div>
          </div>

          {/* Required Certifications — searchable dropdown */}
          <div className="form-section">
            <div className="form-section-header">
              <Award size={18} />
              <div>
                <h3>Required Certifications</h3>
                <p>Search and select courses required for this role</p>
              </div>
            </div>
            {/* Selected courses shown as removable chips */}
            {selectedCourses.length > 0 && (
              <div className="tag-list" style={{ marginBottom: '0.75rem' }}>
                {selectedCourses.map(name => (
                  <span key={name} className="tag-pill">
                    {name} <X size={12} style={{ cursor: 'pointer' }} onClick={() => toggleCourse(name)} />
                  </span>
                ))}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <div className="search-input-wrapper">
                <Search size={14} className="search-icon" />
                <input
                  className="search-input"
                  placeholder="Search courses to add..."
                  value={certSearch}
                  onChange={e => { setCertSearch(e.target.value); setCertDropdownOpen(true); }}
                  onFocus={() => setCertDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setCertDropdownOpen(false), 200)}
                />
              </div>
              {certDropdownOpen && certSearch.length > 0 && (
                <div className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: '200px', overflowY: 'auto', marginTop: '0.25rem' }}>
                  {filteredCourses.length > 0 ? filteredCourses.slice(0, 8).map(c => (
                    <div key={c.id} className="search-dropdown-item" onMouseDown={() => toggleCourse(c.course_name)}>
                      <Award size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                      <span>{c.course_name}</span>
                    </div>
                  )) : (
                    <div className="search-dropdown-empty">No courses match "{certSearch}"</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Skills — searchable dropdown with create-on-the-fly */}
          <div className="form-section">
            <div className="form-section-header">
              <Wrench size={18} />
              <div>
                <h3>Required Skills</h3>
                <p>Search existing skills or type a new one and press Enter to create</p>
              </div>
            </div>
            {skills.length > 0 && (
              <div className="tag-list" style={{ marginBottom: '0.75rem' }}>
                {skills.map(s => (
                  <span key={s} className="tag-pill">
                    {s} <X size={12} style={{ cursor: 'pointer' }} onClick={() => setSkills(skills.filter(x => x !== s))} />
                  </span>
                ))}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <div className="search-input-wrapper">
                <Search size={14} className="search-icon" />
                <input
                  className="search-input"
                  value={skillInput}
                  onChange={e => { setSkillInput(e.target.value); setSkillDropdownOpen(true); }}
                  onFocus={() => setSkillDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setSkillDropdownOpen(false), 200)}
                  placeholder="Search or type a new skill..."
                  onKeyDown={handleSkillKeyDown}
                />
              </div>
              {skillDropdownOpen && skillInput.length > 0 && (
                <div className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: '200px', overflowY: 'auto', marginTop: '0.25rem' }}>
                  {filteredSkills.length > 0 && filteredSkills.slice(0, 8).map(s => (
                    <div key={s.id} className="search-dropdown-item" onMouseDown={() => addSkill(s.name)}>
                      <Wrench size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      <span>{s.name}</span>
                    </div>
                  ))}
                  {/* Always show "create new" option if input doesn't exactly match an existing skill */}
                  {!allSkills.find(s => s.name.toLowerCase() === skillInput.trim().toLowerCase()) && skillInput.trim() && (
                    <div className="search-dropdown-item" style={{ borderTop: filteredSkills.length > 0 ? '1px solid var(--border)' : 'none', color: 'var(--accent-primary)', fontWeight: 500 }} onMouseDown={() => addSkill()}>
                      <Plus size={13} style={{ flexShrink: 0 }} />
                      <span>Create "{skillInput.trim()}"</span>
                    </div>
                  )}
                  {filteredSkills.length === 0 && allSkills.find(s => s.name.toLowerCase() === skillInput.trim().toLowerCase()) && (
                    <div className="search-dropdown-empty">Already added</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => nav('/admin/roles')}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.role_name.trim()}>
              <Save size={15} /> {saving ? 'Saving...' : 'Add Role'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
