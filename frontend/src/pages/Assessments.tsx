import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import {
  CheckCircle2, XCircle, ArrowLeft, Clock,
  FileText, BarChart3, History, Play, ChevronRight, Trophy,
  Calendar, Timer, Target, TrendingUp, TrendingDown, AlertTriangle, X, Loader2,
  Search, Check, Filter, Sparkles, Award, ShieldAlert,
} from 'lucide-react';
import { Skeleton, SkeletonLines } from '../components/Skeleton';
import {
  AssessmentSchedule,
  ScheduleStatus,
  createSchedule,
  getActiveSchedule,
} from '../api/schedules';
import { useLiveEvents } from '../hooks/useLiveEvents';

interface AssessmentRecord {
  user_id: string;
  course_id: string;
  course_name?: string;
  cert_code?: string;
  attempt_number: number;
  duration_minutes: number;
  started_at: string;
  ends_at: string;
  submitted_at: string;
  questions_answered: number;
  score_percentage: number;
  pass_threshold: number;
  passed: boolean;
  readiness_level: string;
  weak_areas: string[];
  strong_areas: string[];
  time_spent_minutes: number;
  proctor: { blocked: boolean; blocked_reason: string | null };
  status?: string; // "completed" | "in_progress" | "expired" | "blocked"
  schedule_id?: string;
}

interface Question {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
}

interface CourseOption {
  id: string;
  course_name: string;
  cert_code?: string;
  level?: string;
  duration_hours?: number;
}

// ─── Main Assessment Page ───────────────────────────────────────────────

export default function Assessments() {
  // The active-exam route /assessments/:scheduleId is handled by TakeExam at
  // the App.tsx level, so this component only renders the hub (schedule +
  // history tabs) and the history-detail drilldown.
  return <AssessmentHub />;
}

// ─── Assessment Hub: History + Schedule ─────────────────────────────────

function AssessmentHub() {
  const navigate = useNavigate();
  const location = window.location.pathname;
  const tab: 'schedule' | 'history' = location.startsWith('/assessments/history') ? 'history' : 'schedule';

  const [history, setHistory] = useState<AssessmentRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [activeLoading, setActiveLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<AssessmentRecord | null>(null);
  const [activeSchedule, setActiveSchedule] = useState<AssessmentSchedule | null>(null);

  const setTab = (t: 'schedule' | 'history') => {
    navigate(t === 'history' ? '/assessments/history' : '/assessments/schedule', { replace: true });
  };

  const refreshActive = useCallback(async () => {
    try {
      const s = await getActiveSchedule();
      setActiveSchedule(s);
    } catch { /* ignore */ } finally {
      setActiveLoading(false);
    }
  }, []);

  const loadHistory = useCallback(() => {
    if (historyLoaded || historyLoading) return;
    setHistoryLoading(true);
    apiClient.get('/api/users/assessment-history')
      .then(r => { setHistory(r.data || []); setHistoryLoaded(true); })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [historyLoaded, historyLoading]);

  useEffect(() => {
    // Schedule tab is the primary entry point — only fetch what it needs:
    // the slim course list (id + name + cert_code) and the active schedule.
    // History is lazy-loaded the moment the user opens the History tab.
    apiClient.get('/api/courses?fields=summary')
      .then(r => setCourses((r.data || []).map((c: any) => ({
        id: c.id, course_name: c.course_name,
        cert_code: c.certification?.cert_code || '',
        level: c.certification?.level || '',
        duration_hours: c.duration_hours,
      }))))
      .catch(() => {})
      .finally(() => setCoursesLoading(false));
    refreshActive();
  }, [refreshActive]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  // Live updates: when assessment-service publishes 'assessment_ready' or
  // 'assessment_failed' notifications, refresh the active schedule so the
  // user sees the new state without reload.
  useLiveEvents((evt) => {
    if (evt.event !== 'notification') return;
    const t = evt.data?.type;
    if (t === 'assessment_ready' || t === 'assessment_failed') {
      refreshActive();
    }
  });

  if (selectedRecord) {
    return <AssessmentDetail record={selectedRecord} onBack={() => setSelectedRecord(null)} />;
  }

  return (
    <div>
      {/* Tabs — render instantly, no blocking spinner */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        <button className={`btn ${tab === 'schedule' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.82rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}
          onClick={() => setTab('schedule')}>
          <Calendar size={14} /> Schedule Assessment
        </button>
        <button className={`btn ${tab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.82rem', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}
          onClick={() => setTab('history')}>
          <History size={14} /> History {historyLoaded ? `(${history.length})` : ''}
        </button>
      </div>

      {tab === 'schedule' ? (
        activeLoading ? (
          <div className="card" style={{ padding: '1.5rem' }} aria-busy="true">
            <Skeleton width="30%" height={14} />
            <div style={{ height: 12 }} />
            <Skeleton width="50%" height={20} />
            <div style={{ height: 14 }} />
            <SkeletonLines count={2} />
          </div>
        ) : (
          <ScheduleAssessment
            courses={courses}
            coursesLoading={coursesLoading}
            navigate={navigate}
            activeSchedule={activeSchedule}
            onScheduleCreated={refreshActive}
          />
        )
      ) : (
        !historyLoaded ? (
          <div aria-busy="true">
            {/* Stats banner — matches real .hist-stats (4 cards) */}
            <div className="hist-stats">
              {[FileText, Trophy, Target, Award].map((Icon, i) => (
                <div className="hist-stat-card" key={i}>
                  <div className="hist-stat-icon" style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}>
                    <Icon size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Skeleton width={48} height={20} />
                    <div style={{ height: 6 }} />
                    <Skeleton width={80} height={10} />
                  </div>
                </div>
              ))}
            </div>

            {/* Toolbar — search + filter chips */}
            <div className="hist-toolbar">
              <Skeleton width="100%" height={36} radius={8} style={{ maxWidth: 320 }} />
              <div className="hist-filters">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} width={70 + (i % 3) * 14} height={28} radius={999} />
                ))}
              </div>
            </div>

            {/* History rows — matches .hist-row (status icon + main + end) */}
            <div className="hist-list">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="hist-row" style={{ pointerEvents: 'none' }}>
                  <div className="hist-row-status" style={{ background: 'var(--surface-2)' }}>
                    <Skeleton width={18} height={18} radius="50%" />
                  </div>
                  <div className="hist-row-main" style={{ flex: 1, minWidth: 0 }}>
                    <Skeleton width="55%" height={14} />
                    <div style={{ height: 8 }} />
                    <div style={{ display: 'flex', gap: 12 }}>
                      <Skeleton width={70} height={11} />
                      <Skeleton width={60} height={11} />
                      <Skeleton width={50} height={11} />
                    </div>
                  </div>
                  <div className="hist-row-end">
                    <Skeleton width={120} height={10} radius={999} />
                    <div style={{ height: 6 }} />
                    <Skeleton width={48} height={18} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <AssessmentHistoryList history={history} onSelect={setSelectedRecord} />
        )
      )}
    </div>
  );
}

// ─── Schedule Assessment: pending guard + create ──────────────────────────

function ScheduleAssessment({
  courses, coursesLoading, navigate, activeSchedule, onScheduleCreated,
}: {
  courses: CourseOption[];
  coursesLoading: boolean;
  navigate: any;
  activeSchedule: AssessmentSchedule | null;
  onScheduleCreated: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [courseQuery, setCourseQuery] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string>('');

  const closeModal = () => {
    setShowModal(false);
    setSelectedCourseId('');
    setCourseQuery('');
    setError('');
  };

  const handleSchedule = async () => {
    if (!selectedCourseId || scheduling) return;
    setScheduling(true);
    setError('');
    try {
      await createSchedule(selectedCourseId);
      onScheduleCreated();
      closeModal();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail === 'active_schedule_exists') {
        setError('You already have an assessment scheduled. Complete it before scheduling another.');
        onScheduleCreated();
      } else if (detail === 'queue_unavailable') {
        setError('Question generation queue is unavailable. Please retry shortly.');
      } else {
        setError(typeof detail === 'string' ? detail : 'Could not schedule assessment.');
      }
    } finally {
      setScheduling(false);
    }
  };

  if (activeSchedule) {
    return <ActiveScheduleCard schedule={activeSchedule} navigate={navigate} />;
  }

  return (
    <>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '4rem 1.5rem', minHeight: '50vh',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(124,58,237,0.10))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '1.25rem',
        }}>
          <Target size={32} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Ready to Test Your Skills?</h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '480px', lineHeight: 1.6, marginBottom: '2rem' }}>
          Schedule a proctored assessment for any of your enrolled courses. Questions are generated from your selected course's modules and topics — give it a moment to prepare.
        </p>
        <button
          className="btn btn-primary"
          style={{ padding: '0.85rem 2rem', fontSize: '0.95rem', borderRadius: 'var(--radius-md)' }}
          onClick={() => setShowModal(true)}
          disabled={coursesLoading || courses.length === 0}
        >
          {coursesLoading ? (
            <><Loader2 size={16} className="spinner-icon" /> Loading courses…</>
          ) : (
            <><Calendar size={16} /> Schedule Assessment</>
          )}
        </button>
        {!coursesLoading && courses.length === 0 && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.75rem' }}>
            No courses available for assessment yet.
          </p>
        )}
      </div>

      {showModal && (
        <div className="assessment-modal-overlay" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="assessment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="assessment-modal-header">
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Schedule Assessment</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', margin: '0.2rem 0 0' }}>
                  We'll generate 20–50 questions from your selected course's topics.
                </p>
              </div>
              <button className="assessment-modal-close" onClick={closeModal} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="assessment-modal-body">
              <label htmlFor="course-search" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                Choose a course
              </label>
              <CourseSearchPicker
                courses={courses}
                query={courseQuery}
                setQuery={setCourseQuery}
                selectedId={selectedCourseId}
                onSelect={(id) => setSelectedCourseId(id)}
                disabled={scheduling}
              />
              {error && (
                <p style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#ef4444' }}>{error}</p>
              )}
            </div>
            <div className="assessment-modal-footer">
              <button className="btn btn-ghost" onClick={closeModal} disabled={scheduling}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSchedule}
                disabled={!selectedCourseId || scheduling}
              >
                {scheduling ? <><Loader2 size={14} className="spinner-icon" /> Scheduling…</> : <><Calendar size={14} /> Schedule</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Searchable Course Picker (combobox, max 5 suggestions) ────────────

const MAX_SUGGESTIONS = 5;

function CourseSearchPicker({
  courses, query, setQuery, selectedId, onSelect, disabled,
}: {
  courses: CourseOption[];
  query: string;
  setQuery: (q: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = courses.find((c) => c.id === selectedId) || null;

  // Match against course name AND cert code; case-insensitive substring.
  const q = query.trim().toLowerCase();
  const filtered = (q
    ? courses.filter((c) =>
        c.course_name.toLowerCase().includes(q) ||
        (c.cert_code || '').toLowerCase().includes(q),
      )
    : courses
  ).slice(0, MAX_SUGGESTIONS);

  // Keep highlight in range when results change.
  useEffect(() => {
    setHighlight(0);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (c: CourseOption) => {
    onSelect(c.id);
    setQuery(`${c.course_name}${c.cert_code ? ` (${c.cert_code})` : ''}`);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) choose(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const clear = () => {
    onSelect('');
    setQuery('');
    setOpen(true);
  };

  return (
    <div className="course-picker" ref={containerRef}>
      <div className={`course-picker-input-wrap${disabled ? ' disabled' : ''}`}>
        <Search size={14} className="course-picker-icon" />
        <input
          id="course-search"
          type="text"
          className="course-picker-input"
          placeholder="Search by course name or cert code (e.g. AZ-900)"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (selected) onSelect(''); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {(query || selected) && !disabled && (
          <button type="button" className="course-picker-clear" onClick={clear} aria-label="Clear">
            <X size={12} />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <ul className="course-picker-list" role="listbox">
          {filtered.map((c, i) => {
            const isSel = c.id === selectedId;
            return (
              <li
                key={c.id}
                role="option"
                aria-selected={isSel}
                className={`course-picker-item${i === highlight ? ' highlight' : ''}${isSel ? ' selected' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); choose(c); }}
                onMouseEnter={() => setHighlight(i)}
              >
                <div className="course-picker-item-main">
                  <span className="course-picker-item-name">{c.course_name}</span>
                  {c.cert_code && <span className="course-picker-item-code">{c.cert_code}</span>}
                </div>
                {isSel && <Check size={14} style={{ color: 'var(--accent-primary)' }} />}
              </li>
            );
          })}
        </ul>
      )}
      {open && filtered.length === 0 && q && (
        <div className="course-picker-empty">No courses match "{query}"</div>
      )}
    </div>
  );
}

// ─── Active Schedule Card ────────────────────────────────────────────────

function ActiveScheduleCard({ schedule, navigate }: { schedule: AssessmentSchedule; navigate: any }) {
  const status: ScheduleStatus = schedule.status;
  const isReady = status === 'ready';
  const isInProgress = status === 'in_progress';
  const isPending = status === 'pending' || status === 'generating';
  const isFailed = status === 'failed';

  const pillColor =
    isReady ? 'var(--success)' :
    isInProgress ? 'var(--accent-primary)' :
    isFailed ? '#ef4444' :
    '#f59e0b';

  const statusLabel =
    status === 'pending' ? 'Queued' :
    status === 'generating' ? 'Generating questions' :
    status === 'ready' ? 'Ready to start' :
    status === 'in_progress' ? 'In progress' :
    status === 'failed' ? 'Failed' :
    status;

  return (
    <div className="card" style={{ padding: '1.5rem', borderLeft: `4px solid ${pillColor}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
              color: pillColor,
              background: `color-mix(in srgb, ${pillColor} 15%, transparent)`,
              padding: '0.2rem 0.55rem', borderRadius: '999px',
            }}>
              {isPending && <Loader2 size={11} className="spinner-icon" style={{ marginRight: 4, verticalAlign: '-1px' }} />}
              {statusLabel}
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{schedule.course_name || 'Assessment'}</h3>
          {schedule.cert_code && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>{schedule.cert_code}</div>
          )}
          {(isReady || isInProgress) && (
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.85rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <span><FileText size={13} /> {schedule.question_count} questions</span>
              <span><Clock size={13} /> {schedule.duration_minutes} min</span>
            </div>
          )}
          {isPending && (
            <p style={{ margin: '0.85rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Sit tight — we're pulling topics from your course and generating personalized questions. You'll get a notification the moment it's ready.
            </p>
          )}
          {isFailed && (
            <p style={{ margin: '0.85rem 0 0', fontSize: '0.85rem', color: '#ef4444' }}>
              {schedule.error || 'Question generation failed. Please cancel and schedule again.'}
            </p>
          )}
        </div>
        <div>
          {(isReady || isInProgress) && (
            <button
              className="btn btn-primary"
              onClick={() => navigate(`/assessments/${schedule.id}`)}
            >
              {isInProgress ? 'Resume' : 'Begin'} <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Assessment History List ────────────────────────────────────────────

function AssessmentHistoryList({ history, onSelect }: { history: AssessmentRecord[]; onSelect: (r: AssessmentRecord) => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed' | 'in_progress' | 'expired'>('all');

  // ── Summary stats ────────────────────────────────────────
  const completed = history.filter(h => h.status === 'completed' || (!h.status && h.submitted_at));
  const passed = completed.filter(h => h.passed).length;
  const failed = completed.length - passed;
  const inProgress = history.filter(h => h.status === 'in_progress').length;
  const avgScore = completed.length
    ? Math.round(completed.reduce((s, h) => s + (h.score_percentage || 0), 0) / completed.length)
    : 0;
  const bestScore = completed.length
    ? Math.max(...completed.map(h => h.score_percentage || 0))
    : 0;
  const passRate = completed.length ? Math.round((passed / completed.length) * 100) : 0;

  if (history.length === 0) {
    return (
      <div className="card" style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(124,58,237,0.10))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.25rem',
        }}>
          <History size={36} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.4rem' }}>No attempts yet</h3>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.88rem', maxWidth: 380, margin: '0 auto 1.5rem' }}>
          Schedule your first assessment to start tracking your readiness across certifications.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/assessments/schedule')}>
          <Calendar size={14} /> Schedule Assessment
        </button>
      </div>
    );
  }

  // ── Apply filter + search ────────────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = history.filter(h => {
    if (filter === 'passed' && !(h.status === 'completed' && h.passed)) return false;
    if (filter === 'failed' && !((h.status === 'completed' || (!h.status && h.submitted_at)) && !h.passed)) return false;
    if (filter === 'in_progress' && h.status !== 'in_progress') return false;
    if (filter === 'expired' && !(h.status === 'expired' || h.status === 'blocked')) return false;
    if (q) {
      const hay = `${h.course_name || ''} ${h.cert_code || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const filterChips: { key: typeof filter; label: string; count: number; icon: any }[] = [
    { key: 'all', label: 'All', count: history.length, icon: BarChart3 },
    { key: 'passed', label: 'Passed', count: passed, icon: CheckCircle2 },
    { key: 'failed', label: 'Failed', count: failed, icon: XCircle },
    { key: 'in_progress', label: 'In Progress', count: inProgress, icon: Clock },
    { key: 'expired', label: 'Expired', count: history.filter(h => h.status === 'expired' || h.status === 'blocked').length, icon: AlertTriangle },
  ];

  return (
    <div>
      {/* ── Stats banner ───────────────────────────────────── */}
      <div className="hist-stats">
        <div className="hist-stat-card">
          <div className="hist-stat-icon" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--accent-primary)' }}>
            <FileText size={18} />
          </div>
          <div>
            <div className="hist-stat-value">{history.length}</div>
            <div className="hist-stat-label">Total attempts</div>
          </div>
        </div>
        <div className="hist-stat-card">
          <div className="hist-stat-icon" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}>
            <Trophy size={18} />
          </div>
          <div>
            <div className="hist-stat-value">{passRate}<span className="hist-stat-unit">%</span></div>
            <div className="hist-stat-label">Pass rate</div>
          </div>
        </div>
        <div className="hist-stat-card">
          <div className="hist-stat-icon" style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>
            <Target size={18} />
          </div>
          <div>
            <div className="hist-stat-value">{avgScore}<span className="hist-stat-unit">%</span></div>
            <div className="hist-stat-label">Avg score</div>
          </div>
        </div>
        <div className="hist-stat-card">
          <div className="hist-stat-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
            <Award size={18} />
          </div>
          <div>
            <div className="hist-stat-value">{bestScore}<span className="hist-stat-unit">%</span></div>
            <div className="hist-stat-label">Best score</div>
          </div>
        </div>
      </div>

      {/* ── Search + filter chips ─────────────────────────── */}
      <div className="hist-toolbar">
        <div className="hist-search">
          <Search size={14} className="hist-search-icon" />
          <input
            type="text"
            className="hist-search-input"
            placeholder="Search by course or cert code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="hist-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={12} />
            </button>
          )}
        </div>
        <div className="hist-filters">
          {filterChips.map(({ key, label, count, icon: Icon }) => (
            <button
              key={key}
              className={`hist-chip${filter === key ? ' is-active' : ''}`}
              onClick={() => setFilter(key)}
              disabled={count === 0 && key !== 'all'}
            >
              <Icon size={12} />
              {label}
              <span className="hist-chip-count">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Result list ─────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
          <Filter size={28} style={{ color: 'var(--text-tertiary)', margin: '0 auto 0.75rem' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            No attempts match your filters
          </p>
          {(search || filter !== 'all') && (
            <button
              className="btn btn-ghost"
              style={{ marginTop: '1rem', fontSize: '0.8rem' }}
              onClick={() => { setSearch(''); setFilter('all'); }}
            >
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <div className="hist-list">
          {filtered.map((h, idx) => (
            <HistoryRow
              key={h.schedule_id || `${h.course_id}-${h.attempt_number}-${idx}`}
              h={h}
              onClick={() => {
                if (h.status === 'in_progress') navigate('/assessments/schedule');
                else if (h.schedule_id) navigate(`/assessments/history/${h.schedule_id}`);
                else onSelect(h);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── History row card ────────────────────────────────────────────────────

function HistoryRow({ h, onClick }: { h: AssessmentRecord; onClick: () => void }) {
  const isInProgress = h.status === 'in_progress';
  const isExpired = h.status === 'expired';
  const isBlocked = h.status === 'blocked';
  const isCompleted = !isInProgress && !isExpired && !isBlocked;

  const accent =
    isInProgress ? 'var(--accent-primary)' :
    isBlocked ? '#ef4444' :
    isExpired ? 'var(--text-tertiary)' :
    h.passed ? 'var(--success)' : 'var(--warning)';

  const StatusIcon =
    isInProgress ? Clock :
    isBlocked ? ShieldAlert :
    isExpired ? AlertTriangle :
    h.passed ? CheckCircle2 : XCircle;

  const readinessColors: Record<string, string> = {
    'Ready': 'var(--success)',
    'Borderline': '#f59e0b',
    'Almost Ready': '#f97316',
    'Not Ready': '#ef4444',
  };
  const readinessColor = readinessColors[h.readiness_level] || 'var(--text-tertiary)';

  const pct = isCompleted ? Math.max(0, Math.min(100, h.score_percentage || 0)) : 0;
  const dateLabel = h.started_at
    ? new Date(h.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const weakCount = (h.weak_areas || []).length;
  const strongCount = (h.strong_areas || []).length;
  const timeSpent = h.time_spent_minutes ? `${Math.round(h.time_spent_minutes)}m` : null;

  return (
    <button type="button" className="hist-row" onClick={onClick} style={{ ['--row-accent' as any]: accent }}>
      <div className="hist-row-status" style={{ color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)` }}>
        <StatusIcon size={18} />
      </div>

      <div className="hist-row-main">
        <div className="hist-row-title-line">
          <span className="hist-row-title">{h.course_name || h.course_id}</span>
          {h.cert_code && <span className="hist-row-cert">{h.cert_code}</span>}
        </div>
        <div className="hist-row-meta">
          <span className="hist-row-meta-item"><Calendar size={11} />{dateLabel}</span>
          <span className="hist-row-meta-item">Attempt #{h.attempt_number}</span>
          {timeSpent && <span className="hist-row-meta-item"><Timer size={11} />{timeSpent}</span>}
          {isCompleted && (
            <span className="hist-row-meta-item" style={{ color: readinessColor, fontWeight: 600 }}>
              <Sparkles size={11} />{h.readiness_level}
            </span>
          )}
          {isInProgress && <span className="hist-row-meta-item" style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>In progress</span>}
          {isBlocked && <span className="hist-row-meta-item" style={{ color: '#ef4444', fontWeight: 600 }}>Blocked</span>}
          {isExpired && <span className="hist-row-meta-item" style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>Expired</span>}
          {isCompleted && (strongCount > 0 || weakCount > 0) && (
            <>
              {strongCount > 0 && (
                <span className="hist-row-meta-item" style={{ color: 'var(--success)' }}>
                  <TrendingUp size={11} />{strongCount} strong
                </span>
              )}
              {weakCount > 0 && (
                <span className="hist-row-meta-item" style={{ color: 'var(--warning)' }}>
                  <TrendingDown size={11} />{weakCount} weak
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="hist-row-end">
        {isInProgress ? (
          <span className="hist-row-cta" style={{ background: 'var(--accent-primary)', color: '#fff' }}>
            <Play size={12} /> Continue
          </span>
        ) : isCompleted ? (
          <div className="hist-row-score-wrap">
            <div className="hist-row-score-bar" aria-hidden="true">
              <div className="hist-row-score-fill" style={{ width: `${pct}%`, background: accent }} />
            </div>
            <div className="hist-row-score-num" style={{ color: accent }}>
              {pct}<span className="hist-row-score-unit">%</span>
            </div>
          </div>
        ) : (
          <span className="hist-row-status-pill" style={{ color: accent }}>
            {isBlocked ? 'Blocked' : 'Expired'}
          </span>
        )}
        <ChevronRight size={16} className="hist-row-chev" />
      </div>
    </button>
  );
}

// ─── Assessment Detail View ─────────────────────────────────────────────

function AssessmentDetail({ record, onBack }: { record: AssessmentRecord; onBack: () => void }) {
  const pct = record.score_percentage;
  const passed = record.passed;

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '1rem' }}>
        <ArrowLeft size={16} /> Back to History
      </button>

      {/* Result Header */}
      <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center', borderRadius: '16px' }}>
        <div className="card-body" style={{ padding: '2rem 1.5rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            {passed
              ? <Trophy size={44} style={{ color: 'var(--success)' }} />
              : <AlertTriangle size={44} style={{ color: pct >= 60 ? '#f59e0b' : '#ef4444' }} />
            }
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.2rem' }}>
            {record.course_name || record.course_id}
          </h2>
          {record.cert_code && <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>{record.cert_code}</div>}
          <p style={{
            fontSize: '2.2rem', fontWeight: 800, margin: '0.5rem 0',
            color: passed ? 'var(--success)' : pct >= 60 ? '#f59e0b' : '#ef4444',
          }}>{pct}%</p>
          <span style={{
            display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
            background: passed ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
            color: passed ? 'var(--success)' : 'var(--warning)',
          }}>
            {passed ? 'PASSED' : 'FAILED'} — {record.readiness_level}
          </span>
        </div>
      </div>

      {/* Details Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Target size={18} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Pass Threshold</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{record.pass_threshold}%</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FileText size={18} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Questions</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{record.questions_answered} answered</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Timer size={18} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Time Spent</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{record.time_spent_minutes} min / {record.duration_minutes} min</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Calendar size={18} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Attempt</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>#{record.attempt_number} — {new Date(record.started_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Strong & Weak Areas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <TrendingUp size={16} style={{ color: 'var(--success)' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Strong Areas</span>
            </div>
            {record.strong_areas.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {record.strong_areas.map((area, i) => (
                  <span key={i} style={{
                    fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: '8px',
                    background: 'rgba(16,185,129,0.1)', color: 'var(--success)', fontWeight: 500,
                  }}>{area}</span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>None identified</p>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <TrendingDown size={16} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Weak Areas</span>
            </div>
            {record.weak_areas.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {record.weak_areas.map((area, i) => (
                  <span key={i} style={{
                    fontSize: '0.72rem', padding: '0.25rem 0.6rem', borderRadius: '8px',
                    background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 500,
                  }}>{area}</span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>None identified</p>
            )}
          </div>
        </div>
      </div>

      {/* Proctor Info */}
      {record.proctor && (
        <div className="card">
          <div className="card-body" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {record.proctor.blocked
              ? <AlertTriangle size={18} style={{ color: '#ef4444' }} />
              : <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
            }
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                {record.proctor.blocked ? 'Proctor: Blocked' : 'Proctor: No Issues'}
              </div>
              {record.proctor.blocked_reason && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{record.proctor.blocked_reason}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Take Assessment (quiz) ─────────────────────────────────────────────

function generateQuestions(courseName: string): Question[] {
  return [
    { id: 1, question: `Which feature is most critical for ${courseName}?`, options: ['High Availability', 'Low Latency', 'Cost Optimization', 'All of the above'], correctIndex: 3 },
    { id: 2, question: 'What is the primary benefit of cloud elasticity?', options: ['Lower cost', 'Auto-scaling resources', 'Better security', 'Faster deployment'], correctIndex: 1 },
    { id: 3, question: 'Which Azure service provides serverless compute?', options: ['Virtual Machines', 'Azure Functions', 'AKS', 'App Service'], correctIndex: 1 },
    { id: 4, question: 'What does SLA stand for?', options: ['Service Level Agreement', 'System Load Average', 'Secure Login Access', 'Standard License Agreement'], correctIndex: 0 },
    { id: 5, question: 'Which is NOT a cloud deployment model?', options: ['Public', 'Private', 'Hybrid', 'Distributed'], correctIndex: 3 },
    { id: 6, question: 'Azure Active Directory is primarily used for?', options: ['Storage', 'Identity management', 'Networking', 'Compute'], correctIndex: 1 },
    { id: 7, question: 'Which Azure service provides DDoS protection?', options: ['Azure Firewall', 'Azure DDoS Protection', 'NSG', 'WAF'], correctIndex: 1 },
    { id: 8, question: 'What is Azure Resource Manager (ARM)?', options: ['A compute service', 'A deployment model', 'A monitoring tool', 'A database'], correctIndex: 1 },
    { id: 9, question: 'Which storage tier is cheapest for rarely accessed data?', options: ['Hot', 'Cool', 'Archive', 'Premium'], correctIndex: 2 },
    { id: 10, question: 'What is the purpose of Azure Key Vault?', options: ['Store VMs', 'Manage secrets and keys', 'Monitor apps', 'Route traffic'], correctIndex: 1 },
  ];
}

function TakeAssessment({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseOption | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(Date.now());
  const [result, setResult] = useState<AssessmentRecord | null>(null);

  useEffect(() => {
    apiClient.get('/api/courses').then(res => {
      const found = (res.data || []).find((c: any) => c.id === courseId);
      if (found) {
        setCourse({ id: found.id, course_name: found.course_name, cert_code: found.certification?.cert_code, level: found.certification?.level });
        setQuestions(generateQuestions(found.course_name));
      } else {
        setQuestions(generateQuestions(courseId));
      }
    }).catch(() => {
      setQuestions(generateQuestions(courseId));
    }).finally(() => setLoading(false));
  }, [courseId]);

  const handleSubmit = async () => {
    const correct = questions.reduce((acc, q) => acc + (answers[q.id] === q.correctIndex ? 1 : 0), 0);
    const scorePct = Math.round((correct / questions.length) * 100);
    const timeSpent = Math.max(1, Math.round((Date.now() - startTime) / 60000));

    const domains = ['Cloud Governance', 'Identity Management', 'Azure Storage', 'Virtual Networking', 'CI/CD Pipelines', 'Authentication & Authorization'];
    const weakAreas: string[] = [];
    const strongAreas: string[] = [];
    if (scorePct >= 70) {
      strongAreas.push(domains[Math.floor(Math.random() * domains.length)]);
    } else {
      weakAreas.push(domains[Math.floor(Math.random() * domains.length)]);
    }

    try {
      const res = await apiClient.post('/api/users/assessment-history', {
        course_id: courseId,
        questions_answered: questions.length,
        score_percentage: scorePct,
        pass_threshold: 70,
        duration_minutes: 60,
        time_spent_minutes: timeSpent,
        weak_areas: weakAreas,
        strong_areas: strongAreas,
      });
      setResult(res.data);
    } catch {
      setResult({
        user_id: '',
        course_id: courseId,
        course_name: course?.course_name || courseId,
        attempt_number: 1,
        duration_minutes: 60,
        started_at: new Date(startTime).toISOString(),
        ends_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        questions_answered: questions.length,
        score_percentage: scorePct,
        pass_threshold: 70,
        passed: scorePct >= 70,
        readiness_level: scorePct >= 85 ? 'Ready' : scorePct >= 70 ? 'Borderline' : scorePct >= 60 ? 'Almost Ready' : 'Not Ready',
        weak_areas: weakAreas,
        strong_areas: strongAreas,
        time_spent_minutes: timeSpent,
        proctor: { blocked: false, blocked_reason: null },
      });
    }
    setSubmitted(true);
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center', paddingTop: '4rem' }}>
        <div className="spinner" style={{ margin: '0 auto 1.5rem' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Loading Assessment</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Preparing questions...</p>
      </div>
    );
  }

  // ─── Results ──────────────────────────────────────────────────
  if (submitted && result) {
    const pct = result.score_percentage;
    const passed = result.passed;

    return (
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center', borderRadius: '16px' }}>
          <div className="card-body" style={{ padding: '2.5rem 1.5rem' }}>
            {passed
              ? <Trophy size={48} style={{ color: 'var(--success)' }} />
              : <BarChart3 size={48} style={{ color: pct >= 60 ? '#f59e0b' : '#ef4444' }} />
            }
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0.75rem 0 0.3rem' }}>
              {passed ? 'Assessment Passed!' : 'Keep Practicing'}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
              {course?.course_name || courseId}
            </p>
            <p style={{
              fontSize: '2.5rem', fontWeight: 800, margin: '0.5rem 0',
              color: passed ? 'var(--success)' : pct >= 60 ? '#f59e0b' : '#ef4444',
            }}>{pct}%</p>
            <span style={{
              display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600,
              background: passed ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
              color: passed ? 'var(--success)' : 'var(--warning)',
            }}>{result.readiness_level}</span>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.5rem' }}>
              <button className="btn btn-primary" onClick={() => { setSubmitted(false); setAnswers({}); setCurrentQ(0); }}>
                Retake
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('/assessments')}>
                All Assessments
              </button>
            </div>
          </div>
        </div>

        {/* Answer Review */}
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Review Answers</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {questions.map((q) => {
            const ua = answers[q.id];
            const ca = q.correctIndex;
            const isCorrect = ua === ca;
            return (
              <div key={q.id} className="card" style={{ borderRadius: '14px' }}>
                <div className="card-body" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    {isCorrect
                      ? <CheckCircle2 size={20} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
                      : <XCircle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                    }
                    <p style={{ fontSize: '0.88rem', fontWeight: 500, lineHeight: 1.5 }}>{q.question}</p>
                  </div>
                  <div style={{ marginLeft: '2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {q.options.map((opt, oi) => {
                      const isCA = ca === oi;
                      const isUA = ua === oi;
                      const isWrong = isUA && !isCA;
                      let bg = 'transparent';
                      let border = 'var(--border)';
                      let color = 'inherit';
                      if (isCA) { bg = 'rgba(16,185,129,0.08)'; border = 'var(--success)'; color = 'var(--success)'; }
                      if (isWrong) { bg = 'rgba(239,68,68,0.08)'; border = '#ef4444'; color = '#ef4444'; }
                      return (
                        <div key={oi} style={{
                          padding: '0.5rem 0.75rem', borderRadius: '10px',
                          border: `1.5px solid ${border}`, background: bg,
                          display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem',
                        }}>
                          <span style={{
                            width: '1.5rem', height: '1.5rem', borderRadius: '6px', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', fontWeight: 600,
                            background: isCA ? 'var(--success)' : isWrong ? '#ef4444' : 'var(--surface-1)',
                            color: (isCA || isWrong) ? '#fff' : 'var(--text-tertiary)',
                          }}>{String.fromCharCode(65 + oi)}</span>
                          <span style={{ flex: 1, color }}>{opt}</span>
                          {isCA && <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />}
                          {isWrong && <XCircle size={14} style={{ color: '#ef4444' }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Question View ────────────────────────────────────────────
  const q = questions[currentQ];
  if (!q) return null;
  const answeredCount = Object.keys(answers).length;

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <button className="btn btn-ghost" onClick={() => navigate('/assessments')}>
          <ArrowLeft size={16} /> Back
        </button>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
          {course?.course_name || courseId}
        </span>
      </div>

      {/* Progress */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Question {currentQ + 1} of {questions.length}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{answeredCount}/{questions.length} answered</span>
        </div>
        <div className="progress-bar" style={{ height: '6px' }}>
          <div className="progress-fill" style={{ width: `${((currentQ + 1) / questions.length) * 100}%`, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Question dots */}
      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {questions.map((_, i) => (
          <button key={i} onClick={() => setCurrentQ(i)} style={{
            width: '2rem', height: '2rem', borderRadius: '50%', border: 'none',
            fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
            background: i === currentQ ? 'var(--accent-primary)' : answers[questions[i].id] !== undefined ? 'var(--surface-2)' : 'var(--surface-1)',
            color: i === currentQ ? '#fff' : answers[questions[i].id] !== undefined ? 'var(--text-primary)' : 'var(--text-tertiary)',
            transition: 'all 0.15s',
          }}>{i + 1}</button>
        ))}
      </div>

      {/* Question Card */}
      <div className="card" style={{ borderRadius: '16px', marginBottom: '1.5rem' }}>
        <div className="card-body" style={{ padding: '1.75rem' }}>
          <p style={{ fontSize: '1rem', fontWeight: 500, lineHeight: 1.7, marginBottom: '1.5rem' }}>{q.question}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {q.options.map((opt, oi) => {
              const isSelected = answers[q.id] === oi;
              return (
                <label key={oi} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem', borderRadius: '12px',
                  border: `1.5px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border)'}`,
                  background: isSelected ? 'var(--accent-subtle)' : 'transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                  onClick={() => setAnswers({ ...answers, [q.id]: oi })}
                >
                  <span style={{
                    width: '1.75rem', height: '1.75rem', borderRadius: '8px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 600, flexShrink: 0,
                    background: isSelected ? 'var(--accent-primary)' : 'var(--surface-1)',
                    color: isSelected ? '#fff' : 'var(--text-tertiary)',
                  }}>{String.fromCharCode(65 + oi)}</span>
                  <span style={{ fontSize: '0.88rem', flex: 1 }}>{opt}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
        <button className="btn btn-ghost" disabled={currentQ === 0} onClick={() => setCurrentQ(currentQ - 1)}>
          Previous
        </button>
        {currentQ < questions.length - 1 ? (
          <button className="btn btn-primary" onClick={() => setCurrentQ(currentQ + 1)}>
            Next
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={answeredCount < questions.length}
            onClick={handleSubmit}
          >
            Submit Assessment ({answeredCount}/{questions.length})
          </button>
        )}
      </div>
    </div>
  );
}
