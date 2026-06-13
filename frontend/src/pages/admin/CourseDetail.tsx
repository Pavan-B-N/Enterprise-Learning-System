import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../../api/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Skeleton, SkeletonLines, SkeletonSidebarList } from '../../components/Skeleton';
import {
  ArrowLeft, ArrowRight, Clock, Layers, Trash2, ExternalLink, FileText,
  Pencil, Save, X, Plus, Award, BookOpen, ChevronDown,
  Zap, Search, Eye,
} from 'lucide-react';

interface ModuleData {
  id: string;
  course_id: string;
  title: string;
  order: number;
}

interface TopicData {
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

interface CertTarget {
  vendor: string;
  cert_code: string;
  cert_name?: string;
  official_cert_name?: string;
  cert_exam_url: string;
  exam_cost: number;
  level?: string;
  skills?: { name?: string; skill?: string }[];
}

interface CourseData {
  id: string;
  course_name: string;
  duration_hours: number;
  difficulty: string;
  certification?: CertTarget | null;
  created_at: string;
}

export default function CourseDetail() {
  const { courseId, moduleId: urlModuleId, topicId: urlTopicId } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const [course, setCourse] = useState<CourseData | null>(null);
  const [modules, setModules] = useState<ModuleData[]>([]);
  const [topics, setTopics] = useState<TopicData[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // View state
  const [selectedTopic, setSelectedTopic] = useState<TopicData | null>(null);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  // Add Module dialog
  const [showAddModule, setShowAddModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [savingModule, setSavingModule] = useState(false);

  // Add Topic menu
  const [addTopicModuleId, setAddTopicModuleId] = useState<string | null>(null);
  const [topicMode, setTopicMode] = useState<'choose' | 'search' | 'create' | null>(null);

  // Search existing topic
  const [topicSearch, setTopicSearch] = useState('');
  const [searchResults, setSearchResults] = useState<TopicData[]>([]);
  const [searching, setSearching] = useState(false);

  // Create new topic
  const [newTopic, setNewTopic] = useState({
    topic_name: '',
    content_md: '',
    estimated_minutes: 15,
    reference_links: [] as { title: string; url: string }[],
    key_takeaways: [] as string[],
  });
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newTakeaway, setNewTakeaway] = useState('');
  const [savingTopic, setSavingTopic] = useState(false);

  // Edit course details
  const [editingDetails, setEditingDetails] = useState(false);
  const [editForm, setEditForm] = useState({ course_name: '', duration_hours: 0, difficulty: 'beginner' });
  const [savingDetails, setSavingDetails] = useState(false);

  // Guidance document
  const [guidanceMarkdown, setGuidanceMarkdown] = useState('');
  const [showGuidance, setShowGuidance] = useState(false);
  const [guidanceLoaded, setGuidanceLoaded] = useState(false);
  const [editingGuidance, setEditingGuidance] = useState(false);
  const [savingGuidance, setSavingGuidance] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    Promise.all([
      apiClient.get(`/api/courses/${courseId}`),
      apiClient.get(`/api/modules?course_id=${courseId}`),
      apiClient.get(`/api/topics?course_id=${courseId}&fields=summary`),
    ]).then(([courseRes, modulesRes, topicsRes]) => {
      setCourse(courseRes.data);
      const mods = (modulesRes.data || []).sort((a: ModuleData, b: ModuleData) => a.order - b.order);
      const tops: TopicData[] = topicsRes.data || [];
      setModules(mods);
      setTopics(tops);
      // Select topic from URL or default to first module's first topic
      const isGuidancePath = location.pathname.endsWith('/guidance');
      if (isGuidancePath) {
        // Will trigger guidance load below
      } else if (urlTopicId) {
        const t = tops.find(t => t.id === urlTopicId);
        if (t) {
          setSelectedTopic(t);
          setExpandedModules({ [t.module_id]: true });
          // Lazy-load full topic content
          loadTopicContent(t.id);
        }
      } else if (mods.length > 0) {
        setExpandedModules({ [mods[0].id]: true });
        const firstModuleTopics = tops.filter(t => t.module_id === mods[0].id).sort((a, b) => a.order - b.order);
        if (firstModuleTopics.length > 0) {
          setSelectedTopic(firstModuleTopics[0]);
          nav(`/admin/courses/${courseId}/${mods[0].id}/${firstModuleTopics[0].id}`, { replace: true });
          loadTopicContent(firstModuleTopics[0].id);
        }
      }
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [courseId]);

  // Lazy-load full topic content on demand
  const topicContentCache = React.useRef<Record<string, TopicData>>({});
  const loadTopicContent = async (topicId: string) => {
    if (topicContentCache.current[topicId]) {
      // Already cached — update selected topic with full data
      setSelectedTopic(topicContentCache.current[topicId]);
      setTopics(prev => prev.map(t => t.id === topicId ? topicContentCache.current[topicId] : t));
      return;
    }
    try {
      const res = await apiClient.get(`/api/topics/${topicId}`);
      const fullTopic: TopicData = res.data;
      topicContentCache.current[topicId] = fullTopic;
      setSelectedTopic(fullTopic);
      setTopics(prev => prev.map(t => t.id === topicId ? fullTopic : t));
    } catch (e) { console.error('Failed to load topic content', e); }
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const loadGuidance = async () => {
    if (guidanceLoaded) { setShowGuidance(true); nav(`/admin/courses/${courseId}/guidance`, { replace: true }); return; }
    try {
      const res = await apiClient.get(`/api/courses/${courseId}/guidance`);
      setGuidanceMarkdown(res.data.markdown || '');
    } catch { setGuidanceMarkdown(''); }
    setGuidanceLoaded(true);
    setShowGuidance(true);
    nav(`/admin/courses/${courseId}/guidance`, { replace: true });
  };

  // Detect if URL ends with /guidance on mount
  const isGuidanceUrl = location.pathname.endsWith('/guidance');

  // Auto-load guidance if URL says so
  useEffect(() => {
    if (isGuidanceUrl && !loading && course && !guidanceLoaded) {
      loadGuidance();
    }
  }, [isGuidanceUrl, loading, course]);

  const moduleGroups = modules.map(mod => ({
    module: mod,
    topics: topics.filter(t => t.module_id === mod.id).sort((a, b) => a.order - b.order),
  }));

  // Flat ordered list of all topics for next/prev navigation
  const allTopicsOrdered = moduleGroups.flatMap(g => g.topics);
  const currentTopicIndex = selectedTopic ? allTopicsOrdered.findIndex(t => t.id === selectedTopic.id) : -1;
  const prevTopic = currentTopicIndex > 0 ? allTopicsOrdered[currentTopicIndex - 1] : null;
  const nextTopic = currentTopicIndex >= 0 && currentTopicIndex < allTopicsOrdered.length - 1 ? allTopicsOrdered[currentTopicIndex + 1] : null;

  const navigateToTopic = (topic: TopicData) => {
    setSelectedTopic(topic);
    setShowGuidance(false);
    setExpandedModules(prev => ({ ...prev, [topic.module_id]: true }));
    nav(`/admin/courses/${courseId}/${topic.module_id}/${topic.id}`, { replace: true });
    loadTopicContent(topic.id);
  };

  // ─── Add Module ──────────────────────────────────────────────────────
  const handleAddModule = async () => {
    if (!newModuleTitle.trim() || !courseId) return;
    setSavingModule(true);
    try {
      const res = await apiClient.post('/api/modules', {
        course_id: courseId,
        title: newModuleTitle.trim(),
        order: modules.length + 1,
      });
      setModules(prev => [...prev, res.data].sort((a, b) => a.order - b.order));
      setNewModuleTitle('');
      setShowAddModule(false);
      setExpandedModules(prev => ({ ...prev, [res.data.id]: true }));
    } catch (err) {
      console.error('Failed to add module:', err);
    } finally {
      setSavingModule(false);
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Delete this module and all its topics?')) return;
    try {
      await apiClient.delete(`/api/modules/${moduleId}`);
      setModules(prev => prev.filter(m => m.id !== moduleId));
      setTopics(prev => prev.filter(t => t.module_id !== moduleId));
      if (selectedTopic?.module_id === moduleId) setSelectedTopic(null);
    } catch (err) {
      console.error('Failed to delete module:', err);
    }
  };

  // ─── Add Topic (search existing) ────────────────────────────────────
  const handleTopicSearch = async (query: string) => {
    setTopicSearch(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await apiClient.get(`/api/topics?fields=summary`);
      const all: TopicData[] = res.data || [];
      const existing = new Set(topics.map(t => t.id));
      setSearchResults(
        all.filter(t => !existing.has(t.id) && t.topic_name.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
      );
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const handleAttachExistingTopic = async (topic: TopicData) => {
    if (!addTopicModuleId || !courseId) return;
    try {
      const moduleTopics = topics.filter(t => t.module_id === addTopicModuleId);
      await apiClient.put(`/api/topics/${topic.id}`, {
        course_id: courseId,
        module_id: addTopicModuleId,
        order: moduleTopics.length + 1,
      });
      const res = await apiClient.get(`/api/topics?course_id=${courseId}&fields=summary`);
      setTopics(res.data || []);
      closeTopicPanel();
    } catch (err) {
      console.error('Failed to attach topic:', err);
    }
  };

  // ─── Create New Topic ────────────────────────────────────────────────
  const handleCreateTopic = async () => {
    if (!newTopic.topic_name.trim() || !addTopicModuleId || !courseId) return;
    setSavingTopic(true);
    try {
      const moduleTopics = topics.filter(t => t.module_id === addTopicModuleId);
      await apiClient.post('/api/topics', {
        course_id: courseId,
        module_id: addTopicModuleId,
        topic_name: newTopic.topic_name.trim(),
        order: moduleTopics.length + 1,
        estimated_minutes: newTopic.estimated_minutes,
        content_md: newTopic.content_md,
        reference_links: newTopic.reference_links,
        key_takeaways: newTopic.key_takeaways,
      });
      const res = await apiClient.get(`/api/topics?course_id=${courseId}&fields=summary`);
      setTopics(res.data || []);
      closeTopicPanel();
    } catch (err) {
      console.error('Failed to create topic:', err);
    } finally {
      setSavingTopic(false);
    }
  };

  const closeTopicPanel = () => {
    setAddTopicModuleId(null);
    setTopicMode(null);
    setTopicSearch('');
    setSearchResults([]);
    setNewTopic({ topic_name: '', content_md: '', estimated_minutes: 15, reference_links: [], key_takeaways: [] });
    setNewLinkUrl('');
    setNewTakeaway('');
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!confirm('Remove this topic?')) return;
    try {
      await apiClient.delete(`/api/topics/${topicId}`);
      setTopics(prev => prev.filter(t => t.id !== topicId));
      if (selectedTopic?.id === topicId) setSelectedTopic(null);
    } catch (err) {
      console.error('Failed to delete topic:', err);
    }
  };

  // ─── Edit Course Details ─────────────────────────────────────────────
  const startEditDetails = () => {
    if (!course) return;
    setEditForm({ course_name: course.course_name, duration_hours: course.duration_hours, difficulty: course.difficulty });
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    if (!course) return;
    setSavingDetails(true);
    try {
      const res = await apiClient.put(`/api/courses/${courseId}`, editForm);
      setCourse(res.data);
      setEditingDetails(false);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSavingDetails(false);
    }
  };

  // ─── Delete Course ───────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this course? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/courses/${courseId}`);
      nav('/courses');
    } catch {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="admin-form-page page-enter" style={{ maxWidth: 'none', padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <button className="btn btn-ghost" onClick={() => nav('/courses')} style={{ padding: '0.4rem 0.6rem' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <SkeletonLines count={1} widths={['45%']} />
          <div style={{ height: 6 }} />
          <SkeletonLines count={1} widths={['60%']} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem', padding: '1rem', flex: 1 }} aria-busy="true">
        <div className="card" style={{ padding: '1rem' }}>
          <SkeletonSidebarList groups={3} topicsPerGroup={3} />
        </div>
        <div className="card" style={{ padding: '1.5rem' }}>
          <Skeleton width="50%" height={22} />
          <div style={{ height: 14 }} />
          <SkeletonLines count={8} />
        </div>
      </div>
    </div>
  );
  if (!course) return (
    <div className="admin-form-page page-enter">
      <button className="back-link" onClick={() => nav('/courses')}><ArrowLeft size={18} /> Back to Courses</button>
      <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
        <h3>Course not found</h3>
      </div></div>
    </div>
  );

  return (
    <div className="admin-form-page page-enter" style={{ maxWidth: 'none', padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top header */}
      <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button className="btn btn-ghost" onClick={() => nav('/courses')} style={{ padding: '0.4rem 0.6rem' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          {editingDetails ? (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ fontSize: '1rem', fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.75rem', flex: 1, minWidth: '200px' }}
                value={editForm.course_name} onChange={e => setEditForm(f => ({ ...f, course_name: e.target.value }))} />
              <input type="number" style={{ width: '80px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
                value={editForm.duration_hours} onChange={e => setEditForm(f => ({ ...f, duration_hours: +e.target.value }))} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>hrs</span>
              <select style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.5rem', fontSize: '0.85rem' }}
                value={editForm.difficulty} onChange={e => setEditForm(f => ({ ...f, difficulty: e.target.value }))}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={saveDetails} disabled={savingDetails}><Save size={14} /> Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingDetails(false)}><X size={14} /></button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{course.course_name}</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  <span className={`difficulty-badge ${course.difficulty}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>{course.difficulty}</span>
                  {' '}&middot; {course.duration_hours}h &middot; {modules.length} modules &middot; {topics.length} topics
                </span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={startEditDetails} style={{ marginLeft: 'auto' }}><Pencil size={14} /> Edit</button>
              <button className="btn btn-ghost btn-sm" onClick={loadGuidance}><Eye size={14} /> Guidance</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={handleDelete} disabled={deleting}>
                <Trash2 size={14} /> {deleting ? '...' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Certification badge */}
      {course.certification && course.certification.vendor && (
        <div style={{ padding: '0.5rem 1.25rem', background: 'rgba(59,130,246,0.04)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
          <Award size={15} style={{ color: 'var(--accent-primary)' }} />
          <span><strong>{course.certification.vendor}</strong> — {course.certification.cert_name || course.certification.official_cert_name} ({course.certification.cert_code})</span>
          {course.certification.cert_exam_url && (
            <a href={course.certification.cert_exam_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-primary)', textDecoration: 'none' }}>
              <ExternalLink size={12} /> Exam
            </a>
          )}
        </div>
      )}

      {/* Main split layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left sidebar - modules & topics */}
        <div style={{ width: '320px', minWidth: '280px', borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-card)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--surface-2)' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Modules & Topics
            </span>
            <button className="btn btn-primary btn-sm" style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem' }} onClick={() => setShowAddModule(true)}>
              <Plus size={12} /> Module
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {moduleGroups.length === 0 && (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
                No modules yet. Click "+ Module" to add one.
              </div>
            )}
            {moduleGroups.map((group, gi) => (
              <div key={group.module.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                {/* Module header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', userSelect: 'none' }}>
                  <div onClick={() => toggleModule(group.module.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                    <ChevronDown size={13} style={{ color: 'var(--text-tertiary)', transform: expandedModules[group.module.id] ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
                    <BookOpen size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gi + 1}. {group.module.title}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>{group.topics.length}</span>
                  </div>
                  <button className="btn-icon-sm" style={{ opacity: 0.5 }} onClick={() => handleDeleteModule(group.module.id)} title="Delete module">
                    <Trash2 size={11} />
                  </button>
                </div>

                {/* Topics */}
                {expandedModules[group.module.id] && (
                  <div style={{ paddingBottom: '0.5rem' }}>
                    {group.topics.map((topic) => (
                      <div key={topic.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem 0.4rem 2rem', cursor: 'pointer', fontSize: '0.78rem', color: selectedTopic?.id === topic.id ? 'var(--accent-primary)' : 'var(--text-secondary)', background: selectedTopic?.id === topic.id ? 'rgba(59,130,246,0.08)' : 'transparent', borderLeft: selectedTopic?.id === topic.id ? '2px solid var(--accent-primary)' : '2px solid transparent', fontWeight: selectedTopic?.id === topic.id ? 500 : 400, transition: 'all 0.15s' }}>
                        <div onClick={() => { setSelectedTopic(topic); setShowGuidance(false); nav(`/admin/courses/${courseId}/${topic.module_id}/${topic.id}`, { replace: true }); loadTopicContent(topic.id); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, overflow: 'hidden' }}>
                          <FileText size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.topic_name}</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>{topic.estimated_minutes}m</span>
                        </div>
                        <button className="btn-icon-sm" style={{ opacity: 0.4 }} onClick={() => handleDeleteTopic(topic.id)} title="Remove topic">
                          <X size={10} />
                        </button>
                      </div>
                    ))}

                    {/* Add Topic button */}
                    <button
                      className="btn btn-ghost"
                      style={{ margin: '0.3rem 0.75rem 0.3rem 2rem', fontSize: '0.72rem', padding: '0.3rem 0.6rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-tertiary)' }}
                      onClick={() => { setAddTopicModuleId(group.module.id); setTopicMode('choose'); }}
                    >
                      <Plus size={11} /> Add Topic
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right pane - topic content or creation */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
          {/* Add Topic panel */}
          {topicMode && addTopicModuleId && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                  Add Topic to "{modules.find(m => m.id === addTopicModuleId)?.title}"
                </h3>
                <button className="btn btn-ghost btn-sm" onClick={closeTopicPanel}><X size={14} /></button>
              </div>

              {/* Choose mode */}
              {topicMode === 'choose' && (
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="btn btn-ghost" style={{ flex: 1, padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => setTopicMode('search')}>
                    <Search size={20} style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Add Existing Topic</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Search and attach a topic from another module</span>
                  </button>
                  <button className="btn btn-ghost" style={{ flex: 1, padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => setTopicMode('create')}>
                    <FileText size={20} style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Create New Topic</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Write new content with markdown</span>
                  </button>
                </div>
              )}

              {/* Search existing */}
              {topicMode === 'search' && (
                <div>
                  <div style={{ position: 'relative', marginBottom: '1rem' }}>
                    <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                      style={{ width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', background: 'var(--bg-input)' }}
                      placeholder="Search topics by name..."
                      value={topicSearch}
                      onChange={e => handleTopicSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {searching && <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Searching...</div>}
                  {searchResults.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: '300px', overflowY: 'auto' }}>
                      {searchResults.map(t => (
                        <div key={t.id} style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--surface-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}
                          onClick={() => handleAttachExistingTopic(t)}
                          onMouseOver={e => (e.currentTarget.style.background = 'var(--surface-1)')}
                          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <FileText size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500 }}>{t.topic_name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{t.estimated_minutes} min &middot; {t.content_md ? t.content_md.slice(0, 80) + '...' : 'No content'}</div>
                          </div>
                          <Plus size={14} style={{ color: 'var(--success)' }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {topicSearch.length >= 2 && !searching && searchResults.length === 0 && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', padding: '1rem', textAlign: 'center' }}>No matching topics found</div>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.75rem' }} onClick={() => setTopicMode('choose')}>
                    <ArrowLeft size={13} /> Back
                  </button>
                </div>
              )}

              {/* Create new topic */}
              {topicMode === 'create' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Topic name + minutes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem' }}>Topic Name *</label>
                      <input
                        style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', background: 'var(--bg-input)' }}
                        placeholder="e.g. Azure App Service Configuration"
                        value={newTopic.topic_name}
                        onChange={e => setNewTopic(prev => ({ ...prev, topic_name: e.target.value }))}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem' }}>Minutes</label>
                      <input type="number"
                        style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', background: 'var(--bg-input)' }}
                        value={newTopic.estimated_minutes}
                        onChange={e => setNewTopic(prev => ({ ...prev, estimated_minutes: +e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Content markdown */}
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem' }}>Content (Markdown)</label>
                    <textarea
                      style={{ width: '100%', height: '250px', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.83rem', fontFamily: 'monospace', resize: 'vertical', background: 'var(--bg-input)' }}
                      placeholder="Write topic content in markdown..."
                      value={newTopic.content_md}
                      onChange={e => setNewTopic(prev => ({ ...prev, content_md: e.target.value }))}
                    />
                  </div>

                  {/* Reference links */}
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem' }}>Reference Links</label>
                    {newTopic.reference_links.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.5rem' }}>
                        {newTopic.reference_links.map((link, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem' }}>
                            <ExternalLink size={12} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.url}</span>
                            <button className="btn-icon-sm" onClick={() => setNewTopic(prev => ({ ...prev, reference_links: prev.reference_links.filter((_, j) => j !== i) }))}><X size={10} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', background: 'var(--bg-input)' }}
                        placeholder="https://learn.microsoft.com/..."
                        value={newLinkUrl}
                        onChange={e => setNewLinkUrl(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newLinkUrl.trim()) {
                            setNewTopic(prev => ({ ...prev, reference_links: [...prev.reference_links, { title: newLinkUrl.trim(), url: newLinkUrl.trim() }] }));
                            setNewLinkUrl('');
                          }
                        }}
                      />
                      <button className="btn btn-ghost btn-sm" disabled={!newLinkUrl.trim()} onClick={() => {
                        setNewTopic(prev => ({ ...prev, reference_links: [...prev.reference_links, { title: newLinkUrl.trim(), url: newLinkUrl.trim() }] }));
                        setNewLinkUrl('');
                      }}><Plus size={12} /></button>
                    </div>
                  </div>

                  {/* Key takeaways */}
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem' }}>Key Takeaways</label>
                    {newTopic.key_takeaways.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.5rem' }}>
                        {newTopic.key_takeaways.map((kt, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', background: 'var(--surface-1)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem' }}>
                            <Zap size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                            <span style={{ flex: 1 }}>{kt}</span>
                            <button className="btn-icon-sm" onClick={() => setNewTopic(prev => ({ ...prev, key_takeaways: prev.key_takeaways.filter((_, j) => j !== i) }))}><X size={10} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', background: 'var(--bg-input)' }}
                        placeholder="Key point learners should remember..."
                        value={newTakeaway}
                        onChange={e => setNewTakeaway(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newTakeaway.trim()) {
                            setNewTopic(prev => ({ ...prev, key_takeaways: [...prev.key_takeaways, newTakeaway.trim()] }));
                            setNewTakeaway('');
                          }
                        }}
                      />
                      <button className="btn btn-ghost btn-sm" disabled={!newTakeaway.trim()} onClick={() => {
                        setNewTopic(prev => ({ ...prev, key_takeaways: [...prev.key_takeaways, newTakeaway.trim()] }));
                        setNewTakeaway('');
                      }}><Plus size={12} /></button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                    <button className="btn btn-ghost" onClick={() => setTopicMode('choose')}>
                      <ArrowLeft size={13} /> Back
                    </button>
                    <button className="btn btn-primary" onClick={handleCreateTopic} disabled={savingTopic || !newTopic.topic_name.trim()}>
                      <Save size={14} /> {savingTopic ? 'Creating...' : 'Create Topic'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Topic viewer (when no creation panel active) */}
          {!topicMode && !showGuidance && selectedTopic && (
            <div className="topic-content-pane">
              <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
                  {modules.find(m => m.id === selectedTopic.module_id)?.title || ''}
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{selectedTopic.topic_name}</h1>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={13} /> {selectedTopic.estimated_minutes} min</span>
                </div>
              </div>

              <div className="markdown-body" style={{ fontSize: '0.9rem', lineHeight: 1.8 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedTopic.content_md}</ReactMarkdown>
              </div>

              {selectedTopic.key_takeaways && selectedTopic.key_takeaways.length > 0 && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(59,130,246,0.04)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Zap size={14} style={{ color: 'var(--accent-primary)' }} /> Key Takeaways
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    {selectedTopic.key_takeaways.map((kt, i) => <li key={i}>{kt}</li>)}
                  </ul>
                </div>
              )}

              {selectedTopic.reference_links && selectedTopic.reference_links.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>References</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {selectedTopic.reference_links.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit', fontSize: '0.8rem' }}>
                        <ExternalLink size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontWeight: 500 }}>{link.title || link.url}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Prev / Next navigation */}
              <div style={{ marginTop: '1.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {prevTopic ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => navigateToTopic(prevTopic)}>
                    <ArrowLeft size={14} /> {prevTopic.topic_name}
                  </button>
                ) : <span />}
                {nextTopic ? (
                  <button className="btn btn-primary btn-sm" onClick={() => navigateToTopic(nextTopic)}>
                    {nextTopic.topic_name} <ArrowRight size={14} />
                  </button>
                ) : <span />}
              </div>
            </div>
          )}

          {/* Guidance Document view */}
          {showGuidance && !topicMode && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Guidance Document</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {editingGuidance ? (
                    <>
                      <button className="btn btn-primary btn-sm" disabled={savingGuidance} onClick={async () => {
                        setSavingGuidance(true);
                        try {
                          await apiClient.put(`/api/courses/${courseId}`, { guidance_markdown: guidanceMarkdown });
                        } catch (err) { console.error(err); }
                        finally { setSavingGuidance(false); setEditingGuidance(false); }
                      }}><Save size={14} /> {savingGuidance ? 'Saving...' : 'Save'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingGuidance(false)}><X size={14} /></button>
                    </>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingGuidance(true)}><Pencil size={14} /> Edit</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => { setShowGuidance(false); setEditingGuidance(false); }}><X size={14} /> Close</button>
                </div>
              </div>
              {editingGuidance ? (
                <textarea
                  style={{ flex: 1, width: '100%', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.83rem', fontFamily: 'monospace', resize: 'none', background: 'var(--bg-input)', minHeight: '400px' }}
                  value={guidanceMarkdown}
                  onChange={e => setGuidanceMarkdown(e.target.value)}
                />
              ) : guidanceMarkdown ? (
                <div className="markdown-body" style={{ fontSize: '0.9rem', lineHeight: 1.8 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{guidanceMarkdown}</ReactMarkdown>
                </div>
              ) : (
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No guidance document available. Click Edit to add one.</p>
              )}
            </div>
          )}

          {/* Empty state */}
          {!topicMode && !selectedTopic && !showGuidance && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
              <Layers size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p style={{ fontSize: '0.9rem' }}>Select a topic to view its content, or add modules and topics.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Module Dialog */}
      {showAddModule && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowAddModule(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', width: '420px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>Add Module</h3>
            <input
              style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', background: 'var(--bg-input)', marginBottom: '1rem' }}
              placeholder="Module title, e.g. Develop Azure Compute Solutions"
              value={newModuleTitle}
              onChange={e => setNewModuleTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddModule()}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn btn-ghost" onClick={() => { setShowAddModule(false); setNewModuleTitle(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddModule} disabled={savingModule || !newModuleTitle.trim()}>
                {savingModule ? 'Adding...' : 'Add Module'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
