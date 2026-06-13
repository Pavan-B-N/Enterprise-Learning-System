import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import {
  ArrowLeft, Plus, Trash2, Pencil, Save, X, Search, FileText, Clock, BookOpen,
} from 'lucide-react';

interface Topic {
  id: string;
  course_id: string;
  module_id: string;
  topic_name: string;
  order: number;
  estimated_minutes: number;
  content_md: string;
  reference_links: { title: string; url: string }[];
  key_takeaways: string[];
}

interface CourseOption {
  id: string;
  course_name: string;
}

interface ModuleOption {
  id: string;
  course_id: string;
  title: string;
  order: number;
}

export default function TopicsManager() {
  const nav = useNavigate();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [allModules, setAllModules] = useState<ModuleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState('');
  const [search, setSearch] = useState('');
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    course_id: '',
    module_id: '',
    topic_name: '',
    order: 0,
    estimated_minutes: 15,
    content_md: '',
    reference_links: [] as { title: string; url: string }[],
    key_takeaways: [] as string[],
  });

  useEffect(() => {
    Promise.all([
      apiClient.get('/api/courses'),
      apiClient.get('/api/topics'),
      apiClient.get('/api/modules'),
    ]).then(([coursesRes, topicsRes, modulesRes]) => {
      setCourses(coursesRes.data || []);
      setTopics(topicsRes.data || []);
      setAllModules(modulesRes.data || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fetchTopics = () => {
    const params = filterCourse ? `?course_id=${filterCourse}` : '';
    apiClient.get(`/api/topics${params}`)
      .then(r => setTopics(r.data || []))
      .catch(console.error);
  };

  useEffect(() => { fetchTopics(); }, [filterCourse]);

  const filteredTopics = topics.filter(t =>
    t.topic_name.toLowerCase().includes(search.toLowerCase()) ||
    moduleName(t.module_id).toLowerCase().includes(search.toLowerCase())
  );

  const courseName = (courseId: string) =>
    courses.find(c => c.id === courseId)?.course_name || courseId;

  const moduleName = (moduleId: string) =>
    allModules.find(m => m.id === moduleId)?.title || moduleId;

  const moduleOptionsForCourse = (): ModuleOption[] => {
    if (!form.course_id) return [];
    return allModules.filter(m => m.course_id === form.course_id).sort((a, b) => a.order - b.order);
  };

  const resetForm = () => {
    setForm({ course_id: '', module_id: '', topic_name: '', order: 0, estimated_minutes: 15, content_md: '', reference_links: [], key_takeaways: [] });
    setEditingTopic(null);
    setShowForm(false);
  };

  const startCreate = () => {
    resetForm();
    if (filterCourse) setForm(f => ({ ...f, course_id: filterCourse }));
    setShowForm(true);
  };

  const startEdit = (topic: Topic) => {
    setEditingTopic(topic);
    setForm({
      course_id: topic.course_id,
      module_id: topic.module_id,
      topic_name: topic.topic_name,
      order: topic.order,
      estimated_minutes: topic.estimated_minutes,
      content_md: topic.content_md,
      reference_links: topic.reference_links || [],
      key_takeaways: topic.key_takeaways || [],
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.course_id || !form.module_id || !form.topic_name) return;
    setSaving(true);
    try {
      if (editingTopic) {
        await apiClient.put(`/api/topics/${editingTopic.id}`, {
          module_id: form.module_id,
          topic_name: form.topic_name,
          order: form.order,
          estimated_minutes: form.estimated_minutes,
          content_md: form.content_md,
          reference_links: form.reference_links,
          key_takeaways: form.key_takeaways,
        });
      } else {
        await apiClient.post('/api/topics', form);
      }
      fetchTopics();
      resetForm();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (topicId: string) => {
    if (!confirm('Delete this topic? This cannot be undone.')) return;
    try {
      await apiClient.delete(`/api/topics/${topicId}`);
      setTopics(prev => prev.filter(t => t.id !== topicId));
    } catch (err) {
      console.error(err);
    }
  };

  const addReferenceLink = () => {
    setForm(f => ({ ...f, reference_links: [...f.reference_links, { title: '', url: '' }] }));
  };

  const updateReferenceLink = (i: number, field: 'title' | 'url', value: string) => {
    setForm(f => {
      const links = [...f.reference_links];
      links[i] = { ...links[i], [field]: value };
      return { ...f, reference_links: links };
    });
  };

  const removeReferenceLink = (i: number) => {
    setForm(f => ({ ...f, reference_links: f.reference_links.filter((_, idx) => idx !== i) }));
  };

  const addTakeaway = () => {
    setForm(f => ({ ...f, key_takeaways: [...f.key_takeaways, ''] }));
  };

  const updateTakeaway = (i: number, value: string) => {
    setForm(f => {
      const kt = [...f.key_takeaways];
      kt[i] = value;
      return { ...f, key_takeaways: kt };
    });
  };

  const removeTakeaway = (i: number) => {
    setForm(f => ({ ...f, key_takeaways: f.key_takeaways.filter((_, idx) => idx !== i) }));
  };

  if (loading) return (
    <div aria-busy="true">
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton-shimmer" style={{ width: '35%', height: 24, borderRadius: 6 }} />
        <div style={{ height: 8 }} />
        <div className="skeleton-shimmer" style={{ width: '55%', height: 14, borderRadius: 6 }} />
      </div>
      <div className="card" style={{ padding: '1.5rem' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer" style={{ width: `${90 - (i % 4) * 10}%`, height: 12, borderRadius: 6, marginBottom: 12 }} />
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => nav('/admin')} style={{ marginBottom: '1rem' }}>
        <ArrowLeft size={16} /> Back to Admin
      </button>

      <div className="dash-welcome">
        <h1>Manage Topics</h1>
        <p>Create and edit learning content for course modules</p>
      </div>

      {/* Actions bar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-input-wrapper" style={{ flex: 1, minWidth: '200px' }}>
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search topics..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select
          style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', fontSize: '0.82rem', background: 'var(--bg-input)' }}
          value={filterCourse}
          onChange={e => setFilterCourse(e.target.value)}
        >
          <option value="">All Courses</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
        </select>
        <button className="btn btn-primary" onClick={startCreate}>
          <Plus size={15} /> Add Topic
        </button>
      </div>

      {/* Topic Form (create/edit) */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid var(--accent-primary)' }}>
          <div className="card-header">
            <h3><FileText size={16} /> {editingTopic ? 'Edit Topic' : 'New Topic'}</h3>
            <button className="btn btn-ghost" onClick={resetForm}><X size={16} /></button>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Row 1: Course & Module */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Course *</label>
                <select
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', fontSize: '0.82rem', background: 'var(--bg-input)', width: '100%' }}
                  value={form.course_id}
                  onChange={e => setForm(f => ({ ...f, course_id: e.target.value, module_id: '' }))}
                  disabled={!!editingTopic}
                >
                  <option value="">Select course...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Module *</label>
                <select
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', fontSize: '0.82rem', background: 'var(--bg-input)', width: '100%' }}
                  value={form.module_id}
                  onChange={e => setForm(f => ({ ...f, module_id: e.target.value }))}
                >
                  <option value="">Select module...</option>
                  {moduleOptionsForCourse().map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Topic name, order, minutes */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Topic Name *</label>
                <input
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', fontSize: '0.82rem', background: 'var(--bg-input)', width: '100%' }}
                  value={form.topic_name}
                  onChange={e => setForm(f => ({ ...f, topic_name: e.target.value }))}
                  placeholder="e.g. Git Branching Strategies"
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Order</label>
                <input
                  type="number"
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', fontSize: '0.82rem', background: 'var(--bg-input)', width: '100%' }}
                  value={form.order}
                  onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Minutes</label>
                <input
                  type="number"
                  style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', fontSize: '0.82rem', background: 'var(--bg-input)', width: '100%' }}
                  value={form.estimated_minutes}
                  onChange={e => setForm(f => ({ ...f, estimated_minutes: parseInt(e.target.value) || 15 }))}
                />
              </div>
            </div>

            {/* Content (markdown) */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Content (Markdown) *</label>
              <textarea
                style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.75rem', fontSize: '0.82rem', background: 'var(--bg-input)', width: '100%', minHeight: '300px', fontFamily: 'var(--font-mono)', lineHeight: 1.6, resize: 'vertical' }}
                value={form.content_md}
                onChange={e => setForm(f => ({ ...f, content_md: e.target.value }))}
                placeholder="Write topic content in Markdown..."
              />
            </div>

            {/* Key Takeaways */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Key Takeaways</label>
              {form.key_takeaways.map((kt, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <input
                    style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: 'var(--bg-input)', flex: 1 }}
                    value={kt}
                    onChange={e => updateTakeaway(i, e.target.value)}
                    placeholder="Key takeaway..."
                  />
                  <button className="btn btn-ghost" onClick={() => removeTakeaway(i)} style={{ padding: '0.3rem' }}><X size={14} /></button>
                </div>
              ))}
              <button className="btn btn-ghost" onClick={addTakeaway} style={{ fontSize: '0.78rem' }}>
                <Plus size={13} /> Add Takeaway
              </button>
            </div>

            {/* Reference Links */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.3rem' }}>Reference Links</label>
              {form.reference_links.map((link, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <input
                    style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: 'var(--bg-input)', flex: 1 }}
                    value={link.title}
                    onChange={e => updateReferenceLink(i, 'title', e.target.value)}
                    placeholder="Link title"
                  />
                  <input
                    style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: 'var(--bg-input)', flex: 2 }}
                    value={link.url}
                    onChange={e => updateReferenceLink(i, 'url', e.target.value)}
                    placeholder="https://..."
                  />
                  <button className="btn btn-ghost" onClick={() => removeReferenceLink(i)} style={{ padding: '0.3rem' }}><X size={14} /></button>
                </div>
              ))}
              <button className="btn btn-ghost" onClick={addReferenceLink} style={{ fontSize: '0.78rem' }}>
                <Plus size={13} /> Add Link
              </button>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <button className="btn btn-ghost" onClick={resetForm}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.course_id || !form.module_id || !form.topic_name}>
                <Save size={14} /> {saving ? 'Saving...' : editingTopic ? 'Update Topic' : 'Create Topic'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topics list */}
      {filteredTopics.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <BookOpen size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{search ? 'No matching topics' : 'No topics yet'}</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{search ? 'Try a different search term.' : 'Create your first topic to add learning content.'}</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                  <th style={{ padding: '0.7rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Topic</th>
                  <th style={{ padding: '0.7rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Module</th>
                  <th style={{ padding: '0.7rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Course</th>
                  <th style={{ padding: '0.7rem 1rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Order</th>
                  <th style={{ padding: '0.7rem 1rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Min</th>
                  <th style={{ padding: '0.7rem 1rem', textAlign: 'right', fontWeight: 600, color: 'var(--text-tertiary)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map(topic => (
                  <tr key={topic.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        {topic.topic_name}
                      </div>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', color: 'var(--text-secondary)' }}>{moduleName(topic.module_id)}</td>
                    <td style={{ padding: '0.6rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>{courseName(topic.course_id)}</td>
                    <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>{topic.order}</td>
                    <td style={{ padding: '0.6rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><Clock size={12} /> {topic.estimated_minutes}</span>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost" onClick={() => startEdit(topic)} style={{ padding: '0.3rem 0.5rem' }} title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-ghost" onClick={() => handleDelete(topic.id)} style={{ padding: '0.3rem 0.5rem', color: 'var(--error, #ef4444)' }} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
