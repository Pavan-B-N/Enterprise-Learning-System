import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import {
  ArrowLeft, ArrowRight, BookOpen, Save, Plus, X,
  FileText, Eye, Edit3, CheckCircle, ExternalLink, Award, GitBranch,
} from 'lucide-react';

const GUIDANCE_TEMPLATE = `# Course Title - Study Reference

> **Document ID:** DOC-XXXX-GUIDE
> **Version:** 1.0
> **Last Updated:** ${new Date().toISOString().split('T')[0]}
> **Estimated Study Time:** XX hours

## Exam Overview

Brief description of what this certification validates.

**Pass Threshold:** 70%
**Question Count:** 50
**Time Limit:** 120 minutes

## Skill Domains and Weights

### 1. Domain Name (XX-XX%)
- Topic A
- Topic B

**Key Concepts:**
- Concept details...

## Practice Question Patterns

### Pattern 1: Scenario-Based
> Sample question here?

**Answer:** Answer with explanation
**Citation:** Microsoft Learn - relevant module

## Common Weak Areas

1. **Area** — Description
2. **Area** — Description

## Recommended Study Sequence

1. Week 1-2: First topics
2. Week 3-4: Next topics
`;

export default function AddCourse() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 state
  const [form, setForm] = useState({
    course_name: '', duration_hours: 0, difficulty: 'intermediate', weight: 0.5,
  });
  const [certification, setCertification] = useState({
    vendor: '', cert_code: '', official_cert_name: '', cert_exam_url: '', exam_cost: 0, level: '', skills: [] as { name: string }[],
  });
  const [hasCert, setHasCert] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [allSkills, setAllSkills] = useState<{ id: string; name: string; category: string }[]>([]);
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const [prerequisites, setPrerequisites] = useState<string[]>([]);
  const [allCourses, setAllCourses] = useState<{id: string; course_name: string}[]>([]);
  const [prereqSearch, setPrereqSearch] = useState('');
  const [prereqDropdownOpen, setPrereqDropdownOpen] = useState(false);

  // Step 2 state
  const [guidanceMarkdown, setGuidanceMarkdown] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emptySections, setEmptySections] = useState<string[]>([]);

  const set = (key: string, val: string | number) => setForm(prev => ({ ...prev, [key]: val }));

  // ── Load existing courses for prerequisite picker + skills ──
  useEffect(() => {
    apiClient.get('/api/courses').then(res => {
      setAllCourses(res.data.map((c: any) => ({ id: c.id || c._id, course_name: c.course_name })));
    }).catch(() => {});
    apiClient.get('/api/skills').then(res => {
      setAllSkills(res.data || []);
    }).catch(() => {});
  }, []);

  const filteredCourses = allCourses.filter(c =>
    !prerequisites.includes(c.id) &&
    c.course_name.toLowerCase().includes(prereqSearch.toLowerCase())
  );

  // ── Step navigation ──
  const goToStep2 = () => {
    setEmptySections([]);
    // Pre-fill guidance document if empty
    if (!guidanceMarkdown.trim()) {
      let md = `# ${form.course_name}\n\n`;
      md += `## Course Overview\n\n`;
      md += `- **Difficulty:** ${form.difficulty.charAt(0).toUpperCase() + form.difficulty.slice(1)}\n`;
      md += `- **Duration:** ${form.duration_hours} hours\n`;
      if (hasCert && certification.official_cert_name) {
        md += `- **Certification:** ${certification.official_cert_name} (${certification.cert_code})\n`;
        md += `- **Vendor:** ${certification.vendor}\n`;
        if (certification.exam_cost > 0) md += `- **Exam Cost:** $${certification.exam_cost}\n`;
        if (certification.cert_exam_url) md += `- **Exam Registration:** ${certification.cert_exam_url}\n`;
      }
      md += `\n## Learning Objectives\n\n`;
      md += `<!-- Add what learners will achieve after completing this course -->\n\n`;
      md += `## Module Breakdown\n\n`;
      md += `<!-- Modules and topics will be added after course creation -->\n\n`;
      md += `## Prerequisites\n\n`;
      md += `<!-- List skills or courses learners should complete before starting -->\n\n`;
      md += `## Study Plan & Recommendations\n\n`;
      md += `<!-- Add suggested study order, time allocation, and tips -->\n\n`;
      md += `## Common Pitfalls\n\n`;
      md += `<!-- Describe mistakes learners commonly make and how to avoid them -->\n\n`;
      md += `## Guidance for AI Agent\n\n`;
      md += `<!-- Instructions for the AI agent on how to advise learners -->\n\n`;
      if (hasCert && certification.cert_code) {
        md += `- Align study recommendations with ${certification.cert_code} exam objectives\n`;
      }
      setGuidanceMarkdown(md);
    }
    setStep(2);
  };

  // ── Section validation ──
  const requiredSections = ['Learning Objectives', 'Module Breakdown', 'Study Plan & Recommendations', 'Guidance for AI Agent'];

  const validateSections = (): string[] => {
    const missing: string[] = [];
    for (const section of requiredSections) {
      const headerRegex = new RegExp(`^## ${section.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`, 'm');
      const match = guidanceMarkdown.match(headerRegex);
      if (!match) { missing.push(section); continue; }
      const startIdx = guidanceMarkdown.indexOf(match[0]) + match[0].length;
      const rest = guidanceMarkdown.slice(startIdx);
      const nextHeader = rest.match(/^## /m);
      const sectionContent = nextHeader ? rest.slice(0, nextHeader.index) : rest;
      const stripped = sectionContent.replace(/<!--[\s\S]*?-->/g, '').replace(/\s/g, '');
      if (!stripped) missing.push(section);
    }
    return missing;
  };

  // ── Markdown preview ──
  const renderedPreview = useMemo(() => {
    const lines = guidanceMarkdown.split('\n');
    let html = '';
    let inList = false;

    for (let line of lines) {
      // Escape HTML
      line = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // Inline formatting
      line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      line = line.replace(/\*(.+?)\*/g, '<em>$1</em>');
      line = line.replace(/`(.+?)`/g, '<code>$1</code>');

      if (/^### (.+)$/.test(line)) {
        if (inList) { html += '</ul>'; inList = false; }
        html += line.replace(/^### (.+)$/, '<h3>$1</h3>');
      } else if (/^## (.+)$/.test(line)) {
        if (inList) { html += '</ul>'; inList = false; }
        html += line.replace(/^## (.+)$/, '<h2>$1</h2>');
      } else if (/^# (.+)$/.test(line)) {
        if (inList) { html += '</ul>'; inList = false; }
        html += line.replace(/^# (.+)$/, '<h1>$1</h1>');
      } else if (/^&gt; (.+)$/.test(line)) {
        if (inList) { html += '</ul>'; inList = false; }
        html += line.replace(/^&gt; (.+)$/, '<blockquote>$1</blockquote>');
      } else if (/^[-*] (.+)$/.test(line)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += line.replace(/^[-*] (.+)$/, '<li>$1</li>');
      } else if (/^\d+\. (.+)$/.test(line)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += line.replace(/^\d+\. (.+)$/, '<li>$1</li>');
      } else if (line.trim() === '') {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<div style="height:0.5rem"></div>';
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<p>${line}</p>`;
      }
    }
    if (inList) html += '</ul>';
    return html;
  }, [guidanceMarkdown]);

  const handleSave = async () => {
    if (!form.course_name.trim() || !form.duration_hours || !guidanceMarkdown.trim()) return;
    const missing = validateSections();
    if (missing.length > 0) {
      setEmptySections(missing);
      return;
    }
    setEmptySections([]);
    setSaving(true);
    try {
      const res = await apiClient.post('/api/courses', {
        course_name: form.course_name.trim(),
        duration_hours: form.duration_hours,
        difficulty: form.difficulty,
        weight: form.weight,
        certification: hasCert ? { ...certification, skills: certification.skills.map(s => s.name) } : null,
        prerequisites,
        guidance_markdown: guidanceMarkdown,
      });
      // Navigate to course detail page where modules can be added
      nav(`/admin/courses/${res.data.id || res.data._id}`);
    } catch (err) {
      console.error('Failed to create course:', err);
    } finally {
      setSaving(false);
    }
  };

  const canProceed = form.course_name.trim() && form.duration_hours > 0;

  return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => step === 2 ? setStep(1) : nav('/courses')}>
        <ArrowLeft size={18} /> {step === 2 ? 'Back to Details' : 'Back to Courses'}
      </button>

      <div className="form-page-wrapper">
        <div className="form-page-intro">
          <h1>{step === 1 ? 'Add New Course' : 'Course Guidance Document'}</h1>
          <p>{step === 1 ? 'Define course details, modules, and reference materials.' : 'Write the AI guidance document for this course.'}</p>
        </div>

        {/* ── Stepper ── */}
        <div className="stepper">
          <div className={`stepper-step ${step === 1 ? 'active' : 'completed'}`}>
            <div className="stepper-icon">
              {step > 1 ? <CheckCircle size={20} /> : <span>1</span>}
            </div>
            <div className="stepper-text">
              <div className="stepper-label">Step 1</div>
              <div className="stepper-title">Course Details</div>
            </div>
          </div>
          <div className={`stepper-line ${step > 1 ? 'completed' : ''}`} />
          <div className={`stepper-step ${step === 2 ? 'active' : ''}`}>
            <div className="stepper-icon"><span>2</span></div>
            <div className="stepper-text">
              <div className="stepper-label">Step 2</div>
              <div className="stepper-title">Guidance Document</div>
            </div>
          </div>
        </div>

        {/* ═══════════════ STEP 1 ═══════════════ */}
        {step === 1 && (
          <div className="card form-card">
            {/* Course Details */}
            <div className="form-section">
              <div className="form-section-header">
                <BookOpen size={18} />
                <div>
                  <h3>Course Details</h3>
                  <p>Name and meta information for this course</p>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-field">
                  <label>Course Name <span className="required">*</span></label>
                  <input value={form.course_name} onChange={e => set('course_name', e.target.value)} placeholder="e.g. AZ-900 – Azure Fundamentals" />
                </div>
                <div className="form-field">
                  <label>Duration (hours) <span className="required">*</span></label>
                  <input type="number" min={1} value={form.duration_hours} onChange={e => set('duration_hours', parseInt(e.target.value) || 0)} />
                </div>
                <div className="form-field">
                  <label>Difficulty <span className="required">*</span></label>
                  <select value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Weight <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>(priority 0–1)</span></label>
                  <input type="number" min={0} max={1} step={0.05} value={form.weight} onChange={e => set('weight', parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            {/* Certification Target */}
            <div className="form-section">
              <div className="form-section-header">
                <Award size={18} />
                <div style={{ flex: 1 }}>
                  <h3>Certification Target</h3>
                  <p>Link this course to an official vendor certification exam</p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={hasCert} onChange={e => setHasCert(e.target.checked)} />
                  This course prepares for a cert
                </label>
              </div>

              {hasCert && (
                <div className="form-grid">
                  <div className="form-field">
                    <label>Vendor</label>
                    <select value={certification.vendor} onChange={e => setCertification({ ...certification, vendor: e.target.value })}>
                      <option value="">Select vendor...</option>
                      <option value="Microsoft">Microsoft</option>
                      <option value="Google">Google</option>
                      <option value="AWS">AWS</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Cert Code</label>
                    <input value={certification.cert_code} onChange={e => setCertification({ ...certification, cert_code: e.target.value })} placeholder="e.g. AZ-204" />
                  </div>
                  <div className="form-field">
                    <label>Official Certification Name</label>
                    <input value={certification.official_cert_name} onChange={e => setCertification({ ...certification, official_cert_name: e.target.value })} placeholder="e.g. Azure Developer Associate" />
                  </div>
                  <div className="form-field">
                    <label>Level</label>
                    <select value={certification.level} onChange={e => setCertification({ ...certification, level: e.target.value })}>
                      <option value="">Select level...</option>
                      <option value="Fundamentals">Fundamentals</option>
                      <option value="Associate">Associate</option>
                      <option value="Expert">Expert</option>
                      <option value="Specialty">Specialty</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Exam Registration URL</label>
                    <input value={certification.cert_exam_url} onChange={e => setCertification({ ...certification, cert_exam_url: e.target.value })} placeholder="https://learn.microsoft.com/certifications/..." />
                  </div>
                  <div className="form-field">
                    <label>Exam Cost (USD)</label>
                    <input type="number" min={0} value={certification.exam_cost} onChange={e => setCertification({ ...certification, exam_cost: parseFloat(e.target.value) || 0 })} placeholder="165" />
                  </div>
                  {/* Skills Section */}
                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Exam Skills <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>(skills covered by this certification exam)</span></label>
                    {certification.skills.length > 0 && (
                      <div className="tag-list" style={{ marginBottom: '0.5rem' }}>
                        {certification.skills.map((s, i) => (
                          <span key={i} className="tag-pill">
                            {s.name}
                            <X size={11} style={{ cursor: 'pointer', marginLeft: '0.3rem' }} onClick={() => setCertification({ ...certification, skills: certification.skills.filter((_, j) => j !== i) })} />
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <div className="dropdown-input-wrapper" style={{ flex: 1, position: 'relative' }}>
                        <input
                          className="form-inline-input"
                          style={{ width: '100%' }}
                          value={newSkillName}
                          onChange={e => { setNewSkillName(e.target.value); setSkillDropdownOpen(true); }}
                          onFocus={() => setSkillDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setSkillDropdownOpen(false), 200)}
                          placeholder="Search or type a skill name..."
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newSkillName.trim()) { const addSkill = () => { setCertification({ ...certification, skills: [...certification.skills, { name: newSkillName.trim() }] }); setNewSkillName(''); setSkillDropdownOpen(false); }; const exists = allSkills.some(s => s.name.toLowerCase() === newSkillName.trim().toLowerCase()); if (!exists) { apiClient.post('/api/skills', { name: newSkillName.trim(), category: '' }).then(res => { setAllSkills(prev => [...prev, res.data]); addSkill(); }).catch(() => addSkill()); } else { addSkill(); } } } }}
                        />
                        {skillDropdownOpen && newSkillName.trim() && (() => {
                          const filtered = allSkills.filter(s =>
                            s.name.toLowerCase().includes(newSkillName.toLowerCase()) &&
                            !certification.skills.some(cs => cs.name.toLowerCase() === s.name.toLowerCase())
                          );
                          const exactMatch = allSkills.some(s => s.name.toLowerCase() === newSkillName.trim().toLowerCase());
                          return (filtered.length > 0 || !exactMatch) ? (
                            <div className="search-dropdown">
                              {filtered.slice(0, 8).map(s => (
                                <div key={s.id} className="search-dropdown-item" onMouseDown={() => {
                                  setCertification({ ...certification, skills: [...certification.skills, { name: s.name }] });
                                  setNewSkillName('');
                                  setSkillDropdownOpen(false);
                                }}>
                                  {s.name} {s.category && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginLeft: '0.5rem' }}>({s.category})</span>}
                                </div>
                              ))}
                              {!exactMatch && newSkillName.trim() && (
                                <div className="search-dropdown-item" style={{ color: 'var(--accent-primary)', fontWeight: 500 }} onMouseDown={() => {
                                  apiClient.post('/api/skills', { name: newSkillName.trim(), category: '' }).then(res => {
                                    setAllSkills(prev => [...prev, res.data]);
                                    setCertification({ ...certification, skills: [...certification.skills, { name: res.data.name }] });
                                    setNewSkillName('');
                                    setSkillDropdownOpen(false);
                                  }).catch(() => {
                                    setCertification({ ...certification, skills: [...certification.skills, { name: newSkillName.trim() }] });
                                    setNewSkillName('');
                                    setSkillDropdownOpen(false);
                                  });
                                }}>
                                  <Plus size={13} /> Create "{newSkillName.trim()}"
                                </div>
                              )}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <button className="btn btn-ghost" type="button" onClick={() => {
                        if (newSkillName.trim()) {
                          const exists = allSkills.some(s => s.name.toLowerCase() === newSkillName.trim().toLowerCase());
                          const addSkill = () => { setCertification({ ...certification, skills: [...certification.skills, { name: newSkillName.trim() }] }); setNewSkillName(''); };
                          if (!exists) { apiClient.post('/api/skills', { name: newSkillName.trim(), category: '' }).then(res => { setAllSkills(prev => [...prev, res.data]); addSkill(); }).catch(() => addSkill()); } else { addSkill(); }
                        }
                      }}><Plus size={14} /> Add</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Prerequisites */}
            <div className="form-section">
              <div className="form-section-header">
                <GitBranch size={18} />
                <div>
                  <h3>Prerequisites</h3>
                  <p>Courses that must be completed before starting this one</p>
                </div>
              </div>

              {prerequisites.length > 0 && (
                <div className="prereq-pills">
                  {prerequisites.map(id => {
                    const c = allCourses.find(x => x.id === id);
                    return (
                      <span key={id} className="tag-pill">
                        {c?.course_name || id}
                        <button className="btn-icon-sm" onClick={() => setPrerequisites(prerequisites.filter(p => p !== id))}><X size={11} /></button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="dropdown-input-wrapper">
                <input
                  className="form-inline-input"
                  value={prereqSearch}
                  onChange={e => { setPrereqSearch(e.target.value); setPrereqDropdownOpen(true); }}
                  onFocus={() => setPrereqDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setPrereqDropdownOpen(false), 200)}
                  placeholder="Search courses to add as prerequisite..."
                />
                {prereqDropdownOpen && filteredCourses.length > 0 && (
                  <div className="search-dropdown">
                    {filteredCourses.slice(0, 8).map(c => (
                      <div key={c.id} className="search-dropdown-item" onMouseDown={() => {
                        setPrerequisites([...prerequisites, c.id]);
                        setPrereqSearch('');
                        setPrereqDropdownOpen(false);
                      }}>
                        {c.course_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Step 1 Actions */}
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => nav('/courses')}>Cancel</button>
              <button className="btn btn-primary" onClick={goToStep2} disabled={!canProceed}>
                Next: Guidance Document <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════ STEP 2 ═══════════════ */}
        {step === 2 && (
          <div className="card form-card">
            <div className="form-section" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
              <div className="form-section-header">
                <FileText size={18} />
                <div style={{ flex: 1 }}>
                  <h3>Guidance Document</h3>
                  <p>This Markdown document will be used by AI agents to advise learners.</p>
                </div>
                <div className="editor-toggle">
                  <button className={`toggle-btn ${!previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(false)}>
                    <Edit3 size={14} /> Write
                  </button>
                  <button className={`toggle-btn ${previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(true)}>
                    <Eye size={14} /> Preview
                  </button>
                </div>
              </div>

              <div className="guidance-container">
                {!previewMode ? (
                  <textarea
                    className="guidance-editor"
                    value={guidanceMarkdown}
                    onChange={e => setGuidanceMarkdown(e.target.value)}
                    placeholder="Write your course guidance document in Markdown..."
                    spellCheck={false}
                  />
                ) : (
                  <div className="guidance-preview" dangerouslySetInnerHTML={{ __html: renderedPreview }} />
                )}
              </div>
            </div>

            {/* Section warnings */}
            {emptySections.length > 0 && (
              <div className="section-warnings">
                <p><strong>These sections need content before saving:</strong></p>
                <ul>
                  {emptySections.map(s => <li key={s}>{s} — replace the <code>&lt;!-- ... --&gt;</code> placeholder with actual content</li>)}
                </ul>
              </div>
            )}

            {/* Step 2 Actions */}
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>
                <ArrowLeft size={14} /> Back
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.course_name.trim()}>
                <Save size={15} /> {saving ? 'Creating...' : 'Create Course'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
