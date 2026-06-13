import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Trophy, AlertTriangle, CheckCircle2, XCircle, FileText,
  Calendar, Clock, TrendingUp, TrendingDown, ShieldAlert, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Skeleton, SkeletonLines } from '../components/Skeleton';
import { AssessmentSchedule, getSchedule } from '../api/schedules';

export default function AssessmentReview() {
  const { scheduleId = '' } = useParams();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<AssessmentSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSchedule(scheduleId);
        if (cancelled) return;
        if (s.status !== 'completed') {
          setError(`This assessment is ${s.status}, not completed.`);
        } else {
          setSchedule(s);
        }
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Could not load assessment');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scheduleId]);

  if (loading) return (
    <div className="review-page" aria-busy="true">
      <div className="review-header">
        <button className="btn btn-ghost" onClick={() => navigate('/assessments/history')} style={{ padding: '0.4rem 0.6rem' }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
          <Skeleton width={48} height={48} radius={12} />
          <div style={{ flex: 1 }}>
            <Skeleton width="40%" height={22} />
            <div style={{ height: 8 }} />
            <Skeleton width="60%" height={12} />
          </div>
        </div>
        <Skeleton width={120} height={48} radius={10} />
      </div>
      <div className="review-layout">
        <div className="review-main">
          <div className="card" style={{ padding: '1.5rem' }}>
            <Skeleton width="30%" height={14} />
            <div style={{ height: 12 }} />
            <Skeleton width="90%" height={20} />
            <div style={{ height: 14 }} />
            <SkeletonLines count={4} widths={['85%','75%','80%','70%']} height={14} gap={10} />
          </div>
        </div>
        <div className="review-sidebar">
          <div className="card" style={{ padding: '1.25rem' }}>
            <Skeleton width="50%" height={14} />
            <div style={{ height: 12 }} />
            <SkeletonLines count={4} />
          </div>
        </div>
      </div>
    </div>
  );

  if (error || !schedule) {
    return (
      <div className="card" style={{ maxWidth: 540, margin: '4rem auto', padding: '2rem' }}>
        <AlertTriangle size={28} style={{ color: 'var(--warning)' }} />
        <h2 style={{ margin: '0.75rem 0 0.5rem' }}>Cannot review assessment</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{error || 'Unknown error'}</p>
        <button className="btn btn-primary" onClick={() => navigate('/assessments/history')} style={{ marginTop: '1rem' }}>
          <ArrowLeft size={14} /> Back to history
        </button>
      </div>
    );
  }

  const score = schedule.score_percentage ?? 0;
  const passed = !!schedule.passed;
  const correct = schedule.correct_count ?? 0;
  const total = schedule.total_questions ?? schedule.questions?.length ?? 0;
  const breakdown = schedule.per_topic_breakdown || {};
  const violations = schedule.proctor_violations || [];

  const submittedAt = schedule.submitted_at ? new Date(schedule.submitted_at) : null;
  const startedAt = schedule.started_at ? new Date(schedule.started_at) : null;
  const durationSec = submittedAt && startedAt
    ? Math.max(0, Math.round((submittedAt.getTime() - startedAt.getTime()) / 1000))
    : 0;
  const durationLabel = `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;

  const scoreColor = passed ? 'var(--success)' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="review-page">
      <button className="btn btn-ghost" onClick={() => navigate('/assessments/history')} style={{ marginBottom: '1rem' }}>
        <ArrowLeft size={16} /> Back to history
      </button>

      {/* Top header banner — full width */}
      <div className="review-header card">
        <div className="review-header-main">
          <div className="review-header-icon">
            {passed
              ? <Trophy size={36} style={{ color: 'var(--success)' }} />
              : <AlertTriangle size={36} style={{ color: scoreColor }} />}
          </div>
          <div className="review-header-text">
            <h2 className="review-header-title">{schedule.course_name}</h2>
            {schedule.cert_code && (
              <div className="review-header-subtitle">{schedule.cert_code}</div>
            )}
            <div className="review-header-meta">
              {submittedAt && (
                <span><Calendar size={12} /> {submittedAt.toLocaleDateString()}</span>
              )}
              <span><Clock size={12} /> {durationLabel}</span>
              <span><FileText size={12} /> {total} questions</span>
            </div>
          </div>
        </div>
        <div className="review-header-score">
          <div className="review-header-percent" style={{ color: scoreColor }}>
            {score.toFixed(0)}%
          </div>
          <div className="review-header-correct">
            {correct} / {total} correct
          </div>
          <div className="review-header-status" style={{ color: scoreColor }}>
            {passed ? 'Passed' : 'Did not pass'}
          </div>
        </div>
      </div>

      {/* Main two-column layout */}
      <div className="review-layout">
        {/* LEFT — question review */}
        <div className="review-main">
          {schedule.questions && schedule.questions.length > 0 && (() => {
            const questions = schedule.questions;
            const userAnswers: Record<number, number> = {};
            const ans = (schedule as any).answers || [];
            for (const a of ans) userAnswers[a.index] = a.selected_index;

            const idx = Math.min(currentIdx, questions.length - 1);
            const q = questions[idx];
            const userAnswer = userAnswers[q.index];
            const isCorrect = userAnswer === q.correct_index;

            const correctness = (qq: typeof q): 'correct' | 'incorrect' | 'unanswered' => {
              const u = userAnswers[qq.index];
              if (u === undefined) return 'unanswered';
              return u === qq.correct_index ? 'correct' : 'incorrect';
            };

            return (
              <>
                <h3 className="review-section-title">Question review</h3>

                {/* Question grid navigator */}
                <div className="review-question-grid">
                  {questions.map((qq, i) => {
                    const c = correctness(qq);
                    return (
                      <button
                        key={qq.index}
                        type="button"
                        className={`review-grid-cell ${c}${i === idx ? ' current' : ''}`}
                        onClick={() => setCurrentIdx(i)}
                        title={`Q${i + 1} · ${c}`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>

                {/* Single question card */}
                <div className="card review-question-card" style={{
                  borderLeft: `3px solid ${isCorrect ? 'var(--success)' : '#ef4444'}`,
                }}>
                  <div className="card-body" style={{ padding: '1.5rem 1.75rem' }}>
                    <div className="review-q-meta">
                      <span className="review-q-meta-text">
                        Question {idx + 1} of {questions.length}{q.topic ? ` · ${q.topic}` : ''}
                      </span>
                      <span className={`review-q-status ${isCorrect ? 'correct' : userAnswer === undefined ? 'unanswered' : 'incorrect'}`}>
                        {isCorrect
                          ? <><CheckCircle2 size={12} /> Correct</>
                          : <><XCircle size={12} /> {userAnswer === undefined ? 'Unanswered' : 'Incorrect'}</>}
                      </span>
                    </div>
                    <div className="review-q-stem">{q.question}</div>
                    <div className="review-q-options">
                      {q.options.map((opt, j) => {
                        const isUser = userAnswer === j;
                        const isAnswer = q.correct_index === j;
                        const cls = isAnswer ? 'is-answer' : isUser ? 'is-user-wrong' : '';
                        return (
                          <div key={j} className={`review-q-option ${cls}`}>
                            <span className="review-q-letter">{String.fromCharCode(65 + j)}</span>
                            <span className="review-q-option-text">{opt}</span>
                            {isAnswer && <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />}
                            {isUser && !isAnswer && <XCircle size={16} style={{ color: '#ef4444' }} />}
                          </div>
                        );
                      })}
                    </div>
                    {q.explanation && (
                      <div className="review-q-explanation">
                        <strong>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                </div>

                {/* Prev/Next */}
                <div className="review-q-nav">
                  <button
                    className="btn btn-ghost"
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    disabled={idx === 0}
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <span className="review-q-nav-counter">
                    {idx + 1} / {questions.length}
                  </span>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                    disabled={idx >= questions.length - 1}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </>
            );
          })()}
        </div>

        {/* RIGHT — sticky sidebar with summaries */}
        <aside className="review-sidebar">
          {/* Strong / weak */}
          {(schedule.strong_areas?.length || schedule.weak_areas?.length) ? (
            <div className="card">
              <div className="card-body" style={{ padding: '1rem 1.1rem' }}>
                {schedule.strong_areas && schedule.strong_areas.length > 0 && (
                  <>
                    <div className="review-side-section-head">
                      <TrendingUp size={14} style={{ color: 'var(--success)' }} />
                      <strong>Strong areas</strong>
                    </div>
                    <ul className="review-side-list">
                      {schedule.strong_areas.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                  </>
                )}
                {schedule.weak_areas && schedule.weak_areas.length > 0 && (
                  <>
                    <div className="review-side-section-head" style={{ marginTop: schedule.strong_areas?.length ? '0.85rem' : 0 }}>
                      <TrendingDown size={14} style={{ color: '#f59e0b' }} />
                      <strong>Areas to revisit</strong>
                    </div>
                    <ul className="review-side-list">
                      {schedule.weak_areas.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {/* Per-topic breakdown */}
          {Object.keys(breakdown).length > 0 && (
            <div className="card">
              <div className="card-body" style={{ padding: '1rem 1.1rem' }}>
                <div className="review-side-section-head" style={{ marginBottom: '0.7rem' }}>
                  <strong>Performance by topic</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {Object.entries(breakdown)
                    .sort(([, a], [, b]) => (a.correct / a.total) - (b.correct / b.total))
                    .map(([topic, v]) => {
                      const pct = v.total ? (v.correct / v.total) * 100 : 0;
                      const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? '#f59e0b' : '#ef4444';
                      return (
                        <div key={topic} className="review-topic-row">
                          <div className="review-topic-name">{topic || 'General'}</div>
                          <div className="review-topic-bar">
                            <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s' }} />
                          </div>
                          <div className="review-topic-score" style={{ color }}>
                            {v.correct}/{v.total}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Proctor flags */}
          {violations.length > 0 && (
            <div className="card" style={{ borderLeft: '3px solid #ef4444' }}>
              <div className="card-body" style={{ padding: '1rem 1.1rem' }}>
                <div className="review-side-section-head">
                  <ShieldAlert size={14} style={{ color: '#ef4444' }} />
                  <strong>Proctor violations ({violations.length})</strong>
                </div>
                <ul className="review-side-list">
                  {violations.slice(0, 8).map((v: any, i: number) => (
                    <li key={i}>
                      {v.type && <span className="review-vio-type">{v.type}</span>}
                      {v.reason || JSON.stringify(v)}
                    </li>
                  ))}
                  {violations.length > 8 && <li>and {violations.length - 8} more…</li>}
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
