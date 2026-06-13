import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Clock, ChevronLeft, ChevronRight, Send, Eye, ShieldAlert } from 'lucide-react';
import {
  AssessmentSchedule,
  getSchedule,
  startSchedule,
  submitSchedule,
  SubmitResult,
} from '../api/schedules';

type Phase = 'loading' | 'consent' | 'in_progress' | 'submitting' | 'done' | 'error';

interface Violation {
  type: string;
  reason: string;
  at: string;
}

const VIOLATION_HARD_LIMIT = 3;

export default function TakeExam() {
  const { scheduleId = '' } = useParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string>('');
  const [schedule, setSchedule] = useState<AssessmentSchedule | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [violations, setViolations] = useState<Violation[]>([]);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [autoSubmitReason, setAutoSubmitReason] = useState<string>('');
  const [toast, setToast] = useState<{ reason: string; count: number } | null>(null);
  const [showViolationList, setShowViolationList] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const submittedRef = useRef(false);
  const violationsRef = useRef<Violation[]>([]);
  violationsRef.current = violations;
  const answersRef = useRef<Record<number, number>>({});
  answersRef.current = answers;
  const inProgressRef = useRef(false);
  const scheduleIdRef = useRef('');
  scheduleIdRef.current = scheduleId;

  // ---- load schedule -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getSchedule(scheduleId);
        if (cancelled) return;
        setSchedule(s);
        if (s.status === 'completed') {
          navigate(`/assessments/history/${scheduleId}`, { replace: true });
          return;
        }
        if (s.status === 'in_progress' && s.ends_at) {
          // resume — skip consent
          setPhase('in_progress');
          setSecondsLeft(Math.max(0, Math.floor((new Date(s.ends_at).getTime() - Date.now()) / 1000)));
        } else if (s.status === 'ready') {
          setPhase('consent');
        } else {
          setError(`Assessment is not ready (status: ${s.status})`);
          setPhase('error');
        }
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Failed to load assessment');
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [scheduleId, navigate]);

  // ---- submit (used by user, timer, and proctor breach) -------------------
  const submitNow = useCallback(async (autoReason?: string) => {
    if (submittedRef.current || !schedule) return;
    submittedRef.current = true;

    setPhase('submitting');

    const payload = {
      answers: Object.entries(answersRef.current).map(([idx, sel]) => ({
        index: Number(idx), selected_index: sel,
      })),
      proctor_violations: autoReason
        ? [...violationsRef.current, { type: 'auto_submit', reason: autoReason, at: new Date().toISOString() }]
        : violationsRef.current,
    };

    try {
      const res = await submitSchedule(schedule.id, payload);
      setResult(res);
      setPhase('done');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Submit failed');
      setPhase('error');
    }
  }, [schedule]);

  // ---- proctoring: tab/visibility, fullscreen, copy/paste, screen-share ---
  useEffect(() => {
    if (phase !== 'in_progress') return;

    const recordViolation = (type: string, reason: string) => {
      const v: Violation = { type, reason, at: new Date().toISOString() };
      setViolations((prev) => {
        const next = [...prev, v];
        // Show transient toast describing what just happened.
        setToast({ reason, count: next.length });
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToast(null), 4500);
        if (next.length >= VIOLATION_HARD_LIMIT && !submittedRef.current) {
          // Auto-submit on too many violations.
          const autoMsg = `Proctor breach limit (${VIOLATION_HARD_LIMIT}) reached`;
          setAutoSubmitReason(autoMsg);
          setTimeout(() => submitNow(autoMsg), 0);
        }
        return next;
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        recordViolation('tab_switch', 'Switched away from the assessment tab');
      }
    };
    const onBlur = () => recordViolation('window_blur', 'Window lost focus');
    const block = (e: Event, kind: string) => {
      e.preventDefault();
      recordViolation(kind, `${kind} blocked`);
    };
    const onCopy = (e: ClipboardEvent) => block(e, 'copy');
    const onCut = (e: ClipboardEvent) => block(e, 'cut');
    const onPaste = (e: ClipboardEvent) => block(e, 'paste');
    const onContextMenu = (e: MouseEvent) => { e.preventDefault(); };
    const onSelectStart = (e: Event) => {
      // Allow selection only inside option labels (input/label tags get class-marked elsewhere).
      const t = e.target as HTMLElement;
      if (!t.closest('.allow-select')) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      // Block common shortcuts: Ctrl/Cmd+C/V/X/P/S, F12, Ctrl+Shift+I
      const k = e.key.toLowerCase();
      const meta = e.ctrlKey || e.metaKey;
      if (meta && ['c', 'v', 'x', 'p', 's', 'u'].includes(k)) {
        e.preventDefault();
        recordViolation('shortcut', `${e.key} blocked`);
      }
      if (k === 'f12' || (meta && e.shiftKey && (k === 'i' || k === 'j'))) {
        e.preventDefault();
        recordViolation('devtools', 'Devtools shortcut blocked');
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('selectstart', onSelectStart);
    document.addEventListener('keydown', onKey);

    // Detect screen-sharing attempts: if the user starts getDisplayMedia,
    // we record (browsers don't let us proactively block, but we can catch
    // and stop any track that the page itself starts).
    const origGDM = (navigator.mediaDevices as any)?.getDisplayMedia?.bind(navigator.mediaDevices);
    if (origGDM) {
      (navigator.mediaDevices as any).getDisplayMedia = async (...a: any[]) => {
        recordViolation('screen_share', 'Screen-sharing attempt blocked');
        const stream: MediaStream = await origGDM(...a);
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('Screen sharing is not allowed during the assessment.');
      };
    }

    // Try to enter fullscreen on entry. (Some browsers require a user gesture
    // — the Start button click satisfies that.)
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { /* user denied */ });
    }
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        recordViolation('fullscreen_exit', 'Exited fullscreen mode');
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('selectstart', onSelectStart);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (origGDM) (navigator.mediaDevices as any).getDisplayMedia = origGDM;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [phase, submitNow]);

  // ---- countdown timer ----------------------------------------------------
  useEffect(() => {
    if (phase !== 'in_progress') return;
    if (secondsLeft <= 0) {
      setAutoSubmitReason('Time expired');
      submitNow('Time expired');
      return;
    }
    const t = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [phase, secondsLeft, submitNow]);

  // ---- track whether the exam is currently in progress (for unmount cleanup)
  useEffect(() => {
    inProgressRef.current = phase === 'in_progress';
  }, [phase]);

  // ---- auto-submit if user navigates away mid-exam ------------------------
  // This effect's cleanup runs on unmount. If the user routes away from the
  // page while the exam is in progress, we fire-and-forget a submit with a
  // clear reason so the schedule doesn't get auto-submitted later as
  // "Time expired".
  useEffect(() => {
    return () => {
      if (inProgressRef.current && !submittedRef.current) {
        submittedRef.current = true;
        const reason = 'Left the assessment page';
        const payload = {
          answers: Object.entries(answersRef.current).map(([idx, sel]) => ({
            index: Number(idx), selected_index: sel,
          })),
          proctor_violations: [
            ...violationsRef.current,
            { type: 'navigate_away', reason, at: new Date().toISOString() },
          ],
        };
        // Fire-and-forget; the component is unmounting.
        submitSchedule(scheduleIdRef.current, payload).catch(() => {});
      }
    };
  }, []);

  // ---- guard against accidental navigation --------------------------------
  useEffect(() => {
    if (phase !== 'in_progress') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  // ---- start the exam (user clicks Begin) ---------------------------------
  const handleBegin = async () => {
    if (!schedule) return;
    try {
      const s = await startSchedule(schedule.id);
      setSchedule({ ...schedule, status: 'in_progress', started_at: s.started_at, ends_at: s.ends_at });
      setSecondsLeft(Math.max(1, Math.floor((new Date(s.ends_at).getTime() - Date.now()) / 1000)));
      setPhase('in_progress');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not start the assessment');
      setPhase('error');
    }
  };

  // ---- render -------------------------------------------------------------
  if (phase === 'loading') {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  if (phase === 'error') {
    return (
      <div className="card" style={{ maxWidth: 540, margin: '4rem auto', padding: '2rem' }}>
        <AlertTriangle size={28} style={{ color: 'var(--warning)' }} />
        <h2 style={{ margin: '0.75rem 0 0.5rem' }}>Could not start assessment</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/assessments/schedule')} style={{ marginTop: '1rem' }}>
          <ChevronLeft size={14} /> Back to assessments
        </button>
      </div>
    );
  }

  if (phase === 'consent' && schedule) {
    return (
      <div className="card" style={{ maxWidth: 640, margin: '3rem auto', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <ShieldAlert size={22} style={{ color: 'var(--accent-primary)' }} />
          <h2 style={{ margin: 0 }}>Proctored assessment</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem' }}>
          You're about to start <strong>{schedule.course_name}</strong>
          {schedule.cert_code ? ` (${schedule.cert_code})` : ''}.
        </p>
        <ul style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.65, paddingLeft: '1.1rem', marginTop: '1rem' }}>
          <li><strong>{schedule.question_count}</strong> questions, <strong>{schedule.duration_minutes} minutes</strong> (1 minute per question).</li>
          <li>The assessment runs in fullscreen. Switching tabs, blurring the window, or exiting fullscreen counts as a violation.</li>
          <li>Copy, paste, right-click, screen-sharing, and devtools shortcuts are blocked.</li>
          <li>{VIOLATION_HARD_LIMIT} violations auto-submit your assessment.</li>
          <li>Once started, you cannot pause or restart.</li>
        </ul>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/assessments/schedule')}>
            <ChevronLeft size={14} /> Cancel
          </button>
          <button className="btn btn-primary" onClick={handleBegin}>
            Begin assessment <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'submitting') {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Submitting your assessment…</p>
      </div>
    );
  }

  if (phase === 'done' && result) {
    const color = result.score_percentage >= 70 ? 'var(--success)' : result.score_percentage >= 50 ? '#f59e0b' : '#ef4444';
    return (
      <div className="card" style={{ maxWidth: 640, margin: '3rem auto', padding: '2rem', textAlign: 'center' }}>
        {autoSubmitReason && (
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
          }}>
            <AlertTriangle size={16} style={{ color: '#ef4444', marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: '0.85rem' }}>
              <strong style={{ color: '#ef4444' }}>Auto-submitted: {autoSubmitReason}</strong>
              {violations.length > 0 && (
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: 'var(--text-secondary)' }}>
                  {violations.map((v, i) => (
                    <li key={i} style={{ fontSize: '0.78rem' }}>{v.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <h2 style={{ marginBottom: '0.5rem' }}>{result.passed ? 'Passed!' : 'Better luck next time'}</h2>
        <div style={{ fontSize: '3rem', fontWeight: 800, color, margin: '1rem 0' }}>
          {result.score_percentage.toFixed(0)}%
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>
          {result.correct_count} / {result.total_questions} correct
        </p>
        {result.weak_areas.length > 0 && (
          <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Areas to revisit: <strong>{result.weak_areas.join(', ')}</strong>
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1.5rem' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/assessments/history')}>
            View history
          </button>
          <button className="btn btn-primary" onClick={() => navigate(`/assessments/history/${schedule?.id || ''}`)}>
            Review answers <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ---- in_progress UI -----------------------------------------------------
  if (!schedule || !schedule.questions || schedule.questions.length === 0) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  const total = schedule.questions.length;
  const q = schedule.questions[currentIdx];
  const selected = answers[q.index];
  const answeredCount = Object.keys(answers).length;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeColor = secondsLeft < 60 ? '#ef4444' : secondsLeft < 300 ? '#f59e0b' : 'var(--text-primary)';

  return (
    <div className="proctor-exam-shell" onContextMenu={(e) => e.preventDefault()}>
      <div className="proctor-exam-header">
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {schedule.course_name}{schedule.cert_code ? ` · ${schedule.cert_code}` : ''}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
            Question {currentIdx + 1} of {total} · Answered {answeredCount}/{total}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {violations.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowViolationList((v) => !v)}
                className="proctor-violation-pill"
                aria-label="Show recorded violations"
              >
                <Eye size={14} /> {violations.length} violation{violations.length > 1 ? 's' : ''}
              </button>
              {showViolationList && (
                <div className="proctor-violation-popover">
                  <div className="proctor-violation-popover-header">
                    Recorded violations ({violations.length}/{VIOLATION_HARD_LIMIT})
                  </div>
                  <ul>
                    {violations.map((v, i) => (
                      <li key={i}>
                        <span className="vio-type">{v.type}</span>
                        <span className="vio-reason">{v.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: timeColor, fontWeight: 700 }}>
            <Clock size={16} />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

      <div className="proctor-exam-body">
        <div className="proctor-question">
          <div className="proctor-question-stem allow-select">{q.question}</div>
          <div className="proctor-options">
            {q.options.map((opt, i) => (
              <label
                key={i}
                className={`proctor-option allow-select${selected === i ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name={`q-${q.index}`}
                  checked={selected === i}
                  onChange={() => setAnswers((prev) => ({ ...prev, [q.index]: i }))}
                />
                <span className="proctor-option-letter">{String.fromCharCode(65 + i)}</span>
                <span className="proctor-option-text">{opt}</span>
              </label>
            ))}
          </div>

          {/* Prev / Next / Submit — kept right next to the options for fast UX */}
          <div className="proctor-question-nav">
            <button
              className="btn btn-ghost"
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={currentIdx === 0}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            {currentIdx < total - 1 ? (
              <button
                className="btn btn-primary"
                onClick={() => setCurrentIdx((i) => Math.min(total - 1, i + 1))}
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setShowSubmitConfirm(true)}
              >
                <Send size={14} /> Submit assessment
              </button>
            )}
          </div>
        </div>

        <div className="proctor-side-panel">
          <div className="proctor-side-title">Question navigator</div>
          <div className="proctor-question-grid">
            {schedule.questions.map((qq, i) => (
              <button
                key={qq.index}
                className={`proctor-grid-cell${i === currentIdx ? ' current' : ''}${answers[qq.index] !== undefined ? ' answered' : ''}`}
                onClick={() => setCurrentIdx(i)}
                type="button"
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary proctor-side-submit"
            onClick={() => setShowSubmitConfirm(true)}
          >
            <Send size={14} /> Submit assessment
          </button>
        </div>
      </div>

      {showSubmitConfirm && (
        <div className="proctor-confirm-backdrop" role="dialog" aria-modal="true">
          <div className="proctor-confirm-modal">
            <div className="proctor-confirm-header">
              <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
              <h3>Submit assessment?</h3>
            </div>
            <div className="proctor-confirm-body">
              {answeredCount < total ? (
                <>
                  <p>
                    You have answered <strong>{answeredCount}</strong> of <strong>{total}</strong> questions.
                  </p>
                  <p style={{ color: '#ef4444', fontWeight: 600 }}>
                    {total - answeredCount} question{total - answeredCount > 1 ? 's are' : ' is'} unanswered.
                  </p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Unanswered questions will be marked incorrect. Once submitted you cannot change your answers.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    All <strong>{total}</strong> questions answered.
                  </p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Once submitted you cannot change your answers.
                  </p>
                </>
              )}
            </div>
            <div className="proctor-confirm-footer">
              <button
                className="btn btn-ghost"
                onClick={() => setShowSubmitConfirm(false)}
              >
                Keep working
              </button>
              <button
                className="btn btn-primary"
                onClick={() => { setShowSubmitConfirm(false); submitNow(); }}
              >
                <Send size={14} /> Submit now
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="proctor-violation-toast" role="alert">
          <AlertTriangle size={16} />
          <div>
            <div className="vio-toast-title">Proctor violation recorded</div>
            <div className="vio-toast-body">{toast.reason}</div>
            <div className="vio-toast-meta">
              {toast.count}/{VIOLATION_HARD_LIMIT} — {VIOLATION_HARD_LIMIT - toast.count} before auto-submit
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
