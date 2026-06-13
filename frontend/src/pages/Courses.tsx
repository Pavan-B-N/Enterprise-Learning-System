import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import apiClient from '../api/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Skeleton, SkeletonLines, SkeletonCertGrid, SkeletonCourseGrid, SkeletonSidebarList } from '../components/Skeleton';
import {
  Clock, ExternalLink, ArrowLeft, ArrowRight, MessageSquare,
  CheckCircle2, BookOpen, FileText, Target,
  Zap, Lock, Sparkles, Plus, Layers, Search,
  ChevronDown, Circle, RefreshCw, Play,
} from 'lucide-react';

interface Cert {
  course_id: string;
  course_name: string;
  cert_code: string;
  cert_name: string;
  vendor: string;
  level: string;
  recommended_hours: number;
  pass_threshold: number;
  status: string;
  latest_score: number | null;
}

export default function Courses() {
  const { certId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'in_progress' | 'completed'>('in_progress');
  const [recommendations, setRecommendations] = useState<any>(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [startingCode, setStartingCode] = useState<string | null>(null);

  const handleStartCourse = async (code: string) => {
    if (!code) return;
    const already = certs.find((c) => c.cert_code === code);
    // Only skip enrollment if the user already has a real progress record
    // (in_progress or completed). The /api/users/courses endpoint returns
    // job-role required courses with status='not_started' even when no
    // course_progress doc exists yet, so we MUST still POST in that case.
    if (already && (already.status === 'in_progress' || already.status === 'completed')) {
      navigate(`/courses/${code}`);
      return;
    }
    setStartingCode(code);
    try {
      const res = await apiClient.post('/api/users/courses/enroll', { cert_code: code });
      const newCert = res.data as Cert & { already_enrolled?: boolean };
      if (newCert?.course_id) {
        setCerts((prev) => {
          const idx = prev.findIndex((c) => c.cert_code === newCert.cert_code);
          if (idx === -1) return [...prev, newCert];
          // Replace existing entry so status reflects newly-created progress
          const next = prev.slice();
          next[idx] = { ...prev[idx], ...newCert };
          return next;
        });
      }
      navigate(`/courses/${code}`);
    } catch (e) {
      console.error('Failed to enroll in course', e);
      // Navigate anyway — CourseWorkspace can fall back via curator recs
      navigate(`/courses/${code}`);
    } finally {
      setStartingCode(null);
    }
  };

  useEffect(() => {
    // Only pull courses the user actually has progress on (in_progress |
    // completed) — the tabs on this page don't show "not_started" anyway,
    // so skipping the role-required expansion server-side avoids fetching
    // ~20+ extra course documents on every load.
    Promise.allSettled([
      apiClient.get('/api/users/courses?status=enrolled')
        .then((c) => { setCerts(c.data || []); }),
      apiClient.get('/api/orchestrator/recommendations')
        .then((r) => {
          if (r.data?.cached && r.data.output) {
            setRecommendations(r.data.output);
          }
        }),
    ]).finally(() => setLoading(false));
  }, []);

  const handleRefreshRecommendations = async () => {
    setRecsLoading(true);
    try {
      const res = await apiClient.post('/api/orchestrator/recommendations/refresh');
      if (res.data?.output) {
        setRecommendations(res.data.output);
      }
    } catch (e) {
      console.error('Failed to refresh recommendations', e);
    } finally {
      setRecsLoading(false);
    }
  };

  if (loading) return (
    <div aria-busy="true">
      {/* Curator card skeleton — matches real curator agent card on this page */}
      <div className="dash-section">
        <div className="card agent-recommendation-card">
          <div className="agent-chip-row">
            <span className="agent-chip"><Sparkles size={11} /> Learning Curator Agent</span>
            <Skeleton width={20} height={20} radius="50%" />
          </div>
          <div className="card-body" style={{ padding: '1.25rem', paddingTop: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
              <Target size={16} style={{ color: 'var(--accent-primary)' }} />
              <Skeleton width={220} height={14} />
            </div>
            <div className="curator-recommendations" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {[1, 2, 3].map((i) => (
                <div className="curator-rec-item" key={i} style={{ alignItems: 'flex-start' }}>
                  <div className={`curator-rec-priority prio-${i}`}>{i}</div>
                  <div className="curator-rec-content" style={{ flex: 1, minWidth: 0 }}>
                    <Skeleton width="70%" height={14} />
                    <div style={{ height: 6 }} />
                    <Skeleton width="35%" height={11} />
                    <div style={{ height: 6 }} />
                    <SkeletonLines count={2} widths={['92%', '70%']} height={10} />
                  </div>
                  <Skeleton width={64} height={28} radius={6} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs skeleton */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <Skeleton width={130} height={30} radius={6} />
        <Skeleton width={120} height={30} radius={6} />
      </div>

      {/* Cert grid skeleton */}
      <SkeletonCertGrid count={6} />
    </div>
  );

  // Admin view: manage courses
  if (user?.role === 'admin') {
    return <AdminCoursesView />;
  }

  if (certId) {
    const selected = certs.find((c) => c.cert_code === certId);
    if (!selected) {
      // Not enrolled — try to build a synthetic cert from the latest
      // curator recommendations so any AI-suggested course is openable.
      const recList = Array.isArray(recommendations) ? recommendations : [];
      const fromCurator = recList.find((r: any) => r?.cert_code === certId);
      if (fromCurator) {
        const syntheticCert: Cert = {
          course_id: '',
          course_name: fromCurator.title || certId,
          cert_code: certId,
          cert_name: fromCurator.title || certId,
          vendor: 'Microsoft',
          level: fromCurator.level || 'Associate',
          recommended_hours: fromCurator.recommended_hours || 0,
          pass_threshold: 70,
          status: 'not_started',
          latest_score: null,
        };
        return <CourseWorkspace cert={syntheticCert} plan={null} onBack={() => navigate('/courses')} />;
      }
      return <div className="empty-state"><p>Course not found</p></div>;
    }
    return <CourseWorkspace cert={selected} plan={null} onBack={() => navigate('/courses')} />;
  }

  const completed = certs.filter((c) => c.status === 'completed');
  const inProgress = certs.filter((c) => c.status === 'in_progress');

  const scrollStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' };
  const cardMinWidth: React.CSSProperties = {};

  return (
    <div>
      {/* Curator Recommendation */}
      <div className="dash-section">
        <div className="card agent-recommendation-card">
          <div className="agent-chip-row">
            <span className="agent-chip"><Sparkles size={11} /> Learning Curator Agent</span>
            <button
              type="button"
              className="agent-chip-action"
              onClick={handleRefreshRecommendations}
              disabled={recsLoading}
              title={recsLoading ? 'Asking agent…' : 'Refresh recommendations'}
              aria-label="Refresh recommendations"
            >
              <RefreshCw size={12} className={recsLoading ? 'spin' : ''} />
            </button>
          </div>
          <div className="card-body" style={{ padding: '1.25rem', paddingTop: '2.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Target size={16} style={{ color: 'var(--accent-primary)' }} /> Your Personalized Learning Roadmap
            </h3>
            {recsLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                Getting personalized recommendations from AI agent...
              </div>
            ) : recommendations ? (
              <div className="curator-recommendations">
                {Array.isArray(recommendations) ? recommendations.map((rec: any, idx: number) => {
                  const code = rec.cert_code;
                  const enrolled = code ? certs.find((c) => c.cert_code === code) : undefined;
                  const status = enrolled?.status;
                  const buttonLabel =
                    status === 'in_progress' ? 'Continue' :
                    status === 'completed' ? 'Review' : 'Start';
                  return (
                    <div className="curator-rec-item" key={idx}>
                      <div className="curator-rec-priority">{idx + 1}</div>
                      <div className="curator-rec-content">
                        <div className="curator-rec-title">{rec.title}</div>
                        <div className="curator-rec-meta">{rec.cert_code} &middot; Priority: {rec.priority}</div>
                        <div className="curator-rec-reason">{rec.reason}</div>
                      </div>
                      {code && (
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '0.75rem', padding: '0.4rem 0.7rem', alignSelf: 'flex-start', flexShrink: 0 }}
                          disabled={startingCode === code}
                          onClick={() => handleStartCourse(code)}
                        >
                          {startingCode === code ? (
                            <><RefreshCw size={12} className="spin" /> Starting...</>
                          ) : (
                            <><Play size={12} /> {buttonLabel}</>
                          )}
                        </button>
                      )}
                    </div>
                  );
                }) : (
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.6' }}>
                    {typeof recommendations === 'string' ? recommendations : JSON.stringify(recommendations, null, 2)}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <p style={{ marginBottom: '0.75rem' }}>No recommendations cached yet.</p>
                <button className="btn btn-primary" style={{ fontSize: '0.78rem' }} onClick={handleRefreshRecommendations}>
                  <Sparkles size={13} /> Get AI Recommendations
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        <button className={`btn ${activeTab === 'in_progress' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.82rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}
          onClick={() => setActiveTab('in_progress')}>
          <Clock size={14} /> In Progress ({inProgress.length})
        </button>
        <button className={`btn ${activeTab === 'completed' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.82rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}
          onClick={() => setActiveTab('completed')}>
          <CheckCircle2 size={14} /> Completed ({completed.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'in_progress' && (
        <div style={scrollStyle}>
          {inProgress.length > 0 ? inProgress.map((cert) => (
            <div key={cert.cert_code} className="cert-card" onClick={() => navigate(`/courses/${cert.cert_code}`)}
              style={{ ...cardMinWidth, borderLeft: '3px solid var(--accent-primary)', cursor: 'pointer' }}>
              <span className={`cert-level ${cert.level}`}>{cert.level}</span>
              <h4>{cert.cert_name}</h4>
              <div className="cert-id">{cert.cert_code}</div>
              <div className="cert-meta">
                <span><Clock size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{cert.recommended_hours}h</span>
                <span>Pass: {cert.pass_threshold}%</span>
              </div>
              <div className="cert-actions">
                <span className="badge in-progress">In Progress</span>
              </div>
            </div>
          )) : (
            <div className="card" style={{ width: '100%' }}>
              <div className="card-body" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                No courses in progress yet. Pick one from the Recommended tab to begin!
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'completed' && (
        <div style={scrollStyle}>
          {completed.length > 0 ? completed.map((cert) => (
            <div key={cert.cert_code} className="cert-card" onClick={() => navigate(`/courses/${cert.cert_code}`)}
              style={{ ...cardMinWidth, borderLeft: '3px solid var(--success)', cursor: 'pointer' }}>
              <span className={`cert-level ${cert.level}`}>{cert.level}</span>
              <h4>{cert.cert_name}</h4>
              <div className="cert-id">{cert.cert_code}</div>
              <div className="cert-meta">
                <span><Clock size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />{cert.recommended_hours}h</span>
                <span>Pass: {cert.pass_threshold}%</span>
              </div>
              <div className="cert-actions">
                <span className="badge completed"><CheckCircle2 size={11} /> Completed</span>
                {cert.latest_score !== null && <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>{cert.latest_score}%</span>}
              </div>
            </div>
          )) : (
            <div className="card" style={{ width: '100%' }}>
              <div className="card-body" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                No courses completed yet. Keep going!
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Course Workspace ───────────────────────────────────────────────────

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

interface Module {
  id: string;
  course_id: string;
  title: string;
  order: number;
}

function CourseWorkspace({ cert, plan, onBack }: { cert: Cert; plan: any; onBack: () => void }) {
  const navigate = useNavigate();
  const [modules, setModules] = useState<Module[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      apiClient.get(`/api/modules?course_id=${cert.course_id}`),
      apiClient.get(`/api/topics?course_id=${cert.course_id}&fields=summary`),
      apiClient.get(`/api/users/progress/${cert.course_id}`).catch(() => ({ data: null })),
    ]).then(([modulesRes, topicsRes, progressRes]) => {
      const mods = (modulesRes.data || []).sort((a: Module, b: Module) => a.order - b.order);
      const tops = topicsRes.data || [];
      setModules(mods);
      setTopics(tops);

      // Load completed topics from progress
      const progress = progressRes.data;
      if (progress?.topics_completed) {
        const done = new Set<string>(
          progress.topics_completed.filter((t: any) => t.is_completed).map((t: any) => t.topic_id)
        );
        setCompletedTopics(done);
      }

      if (tops.length > 0) {
        setSelectedTopic(tops[0]);
        setExpandedModules({ [tops[0].module_id]: true });
        loadTopicContent(tops[0].id);
      } else if (mods.length > 0) {
        setExpandedModules({ [mods[0].id]: true });
      }
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [cert.course_id]);

  // Lazy-load full topic content on demand
  const topicContentCache = React.useRef<Record<string, Topic>>({});
  const loadTopicContent = async (topicId: string) => {
    if (topicContentCache.current[topicId]) {
      setSelectedTopic(topicContentCache.current[topicId]);
      return;
    }
    try {
      const res = await apiClient.get(`/api/topics/${topicId}`);
      const fullTopic: Topic = res.data;
      topicContentCache.current[topicId] = fullTopic;
      setSelectedTopic(fullTopic);
    } catch (e) { console.error('Failed to load topic content', e); }
  };

  // Group topics by module
  const moduleGroups = modules.map(mod => ({
    module: mod,
    topics: topics.filter(t => t.module_id === mod.id).sort((a, b) => a.order - b.order),
  }));

  // Flat ordered list for next/prev
  const allTopicsOrdered = moduleGroups.flatMap(g => g.topics);
  const currentTopicIndex = selectedTopic ? allTopicsOrdered.findIndex(t => t.id === selectedTopic.id) : -1;
  const prevTopic = currentTopicIndex > 0 ? allTopicsOrdered[currentTopicIndex - 1] : null;
  const nextTopic = currentTopicIndex >= 0 && currentTopicIndex < allTopicsOrdered.length - 1 ? allTopicsOrdered[currentTopicIndex + 1] : null;

  const markTopicComplete = async (topicId: string) => {
    try {
      await apiClient.put(`/api/users/progress/${cert.course_id}/complete-topic`, { topic_id: topicId });
      setCompletedTopics(prev => new Set(prev).add(topicId));
    } catch (e) { console.error('Failed to mark topic complete', e); }
  };

  const goToTopic = (topic: Topic) => {
    setSelectedTopic(topic);
    setExpandedModules(prev => ({ ...prev, [topic.module_id]: true }));
    loadTopicContent(topic.id);
  };

  const handleNext = () => {
    if (selectedTopic) {
      markTopicComplete(selectedTopic.id);
    }
    if (nextTopic) goToTopic(nextTopic);
  };

  const handlePrev = () => {
    if (prevTopic) goToTopic(prevTopic);
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onBack} style={{ padding: '0.4rem 0.6rem' }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{cert.cert_name}</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{cert.cert_code} &middot; {cert.vendor}</span>
          </div>
          <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => navigate('/chat')}>
            <MessageSquare size={14} /> Ask AI
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem', padding: '1rem', flex: 1 }} aria-busy="true">
          <div className="card" style={{ padding: '1rem' }}>
            <SkeletonSidebarList groups={3} topicsPerGroup={3} />
          </div>
          <div className="card" style={{ padding: '1.5rem' }}>
            <Skeleton width="45%" height={22} />
            <div style={{ height: 14 }} />
            <SkeletonLines count={8} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ padding: '0.4rem 0.6rem' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{cert.cert_name}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{cert.cert_code} &middot; {cert.vendor} &middot; {cert.recommended_hours}h &middot; Pass: {cert.pass_threshold}%</span>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => navigate('/chat')}>
          <MessageSquare size={14} /> Ask AI
        </button>
      </div>

      {/* Split pane */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 0 }}>
        {/* Left sidebar - modules & topics nav */}
        <div style={{ width: '280px', minWidth: '240px', borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-card)', flexShrink: 0 }}>
          <div style={{ padding: '0.75rem 0.75rem 0.5rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Modules & Topics
          </div>
          {moduleGroups.length === 0 && !loading && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
              No topics available yet for this course.
            </div>
          )}
          {moduleGroups.map((group, gi) => (
            <div key={group.module.id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
              {/* Module header */}
              <div
                onClick={() => toggleModule(group.module.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 0.75rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', userSelect: 'none' }}
              >
                <ChevronDown size={14} style={{ color: 'var(--text-tertiary)', transform: expandedModules[group.module.id] ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
                <BookOpen size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>Module {gi + 1}: {group.module.title}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>{group.topics.length}</span>
              </div>
              {/* Topic list */}
              {expandedModules[group.module.id] && (
                <div style={{ paddingBottom: '0.25rem' }}>
                  {group.topics.map((topic) => (
                    <div
                      key={topic.id}
                      onClick={() => goToTopic(topic)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                        cursor: 'pointer', fontSize: '0.8rem',
                        color: selectedTopic?.id === topic.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        background: selectedTopic?.id === topic.id ? 'rgba(59,130,246,0.08)' : 'transparent',
                        borderLeft: selectedTopic?.id === topic.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        fontWeight: selectedTopic?.id === topic.id ? 500 : 400,
                        transition: 'all 0.15s',
                      }}
                    >
                      {completedTopics.has(topic.id) ? (
                        <CheckCircle2 size={13} style={{ flexShrink: 0, color: 'var(--success, #22c55e)' }} />
                      ) : (
                        <Circle size={13} style={{ flexShrink: 0, opacity: 0.4 }} />
                      )}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.topic_name}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', flexShrink: 0 }}>{topic.estimated_minutes}m</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right pane - topic content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
          {selectedTopic ? (
            <div className="topic-content-pane">
              {/* Topic header */}
              <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.3rem' }}>
                  {modules.find(m => m.id === selectedTopic.module_id)?.title || ''}
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{selectedTopic.topic_name}</h1>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={13} /> {selectedTopic.estimated_minutes} min</span>
                </div>
              </div>

              {/* Markdown content */}
              <div className="markdown-body" style={{ fontSize: '0.9rem', lineHeight: 1.8 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedTopic.content_md}</ReactMarkdown>
              </div>

              {/* Key takeaways */}
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

              {/* Reference links */}
              {selectedTopic.reference_links && selectedTopic.reference_links.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4 style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    References
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {selectedTopic.reference_links.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit', fontSize: '0.8rem', transition: 'background 0.15s' }}
                        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--surface-1)')}
                        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <ExternalLink size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontWeight: 500 }}>{link.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Prev / Next navigation */}
              <div style={{ marginTop: '1.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {prevTopic ? (
                  <button className="btn btn-ghost btn-sm" onClick={handlePrev} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ArrowLeft size={14} /> {prevTopic.topic_name}
                  </button>
                ) : <span />}
                {nextTopic ? (
                  <button className="btn btn-primary btn-sm" onClick={handleNext} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    Mark Complete & Next <ArrowRight size={14} />
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => { if (selectedTopic) markTopicComplete(selectedTopic.id); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle2 size={14} /> Mark Complete
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
              <BookOpen size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p style={{ fontSize: '0.9rem' }}>Select a topic from the left to start learning</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Courses View ─────────────────────────────────────────────────

function AdminCoursesView() {
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

  return (
    <div>
      <div className="dash-welcome">
        <h1>Manage Courses</h1>
        <p>Add, edit, and manage courses</p>
      </div>

      {/* Actions bar */}
      <div className="courses-actions-bar">
        <div className="search-input-wrapper">
          <Search size={15} className="search-icon" />
          <input
            className="search-input"
            placeholder="Search courses..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            disabled={loading}
          />
        </div>
        <button className="btn btn-primary" onClick={() => nav('/admin/courses/add')}>
          <Plus size={15} /> Add Course
        </button>
      </div>

      {/* Course Cards Grid */}
      {loading ? (
        <SkeletonCourseGrid count={6} />
      ) : filtered.length > 0 ? (
        <div className="course-card-grid">
          {filtered.map((c) => (
            <div key={c.id} className="course-card" onClick={() => nav(`/admin/courses/${c.id}`)} style={{ cursor: 'pointer' }}>
              <div className="course-card-header">
                <span className={`difficulty-badge ${c.difficulty}`}>{c.difficulty}</span>
              </div>
              <h3 className="course-card-title">{c.course_name}</h3>
              <div className="course-card-meta">
                <span><Clock size={13} /> {c.duration_hours}h</span>
              </div>
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
