import { useState, FormEvent } from 'react';
import {
  Compass,
  ClipboardCheck,
  CalendarClock,
  HeartPulse,
  Users,
  GraduationCap,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';

const AGENTS: Array<{ icon: JSX.Element; name: string; blurb: string }> = [
  {
    icon: <Compass size={14} />,
    name: 'Learning Path Curator',
    blurb: 'Cited paths for your role + cert target.',
  },
  {
    icon: <ClipboardCheck size={14} />,
    name: 'Assessment Agent',
    blurb: 'Grounded questions, real readiness scores.',
  },
  {
    icon: <CalendarClock size={14} />,
    name: 'Study Plan Generator',
    blurb: 'Weekly plan that respects your meetings.',
  },
  {
    icon: <HeartPulse size={14} />,
    name: 'Engagement Agent',
    blurb: 'Nudges that skip your focus windows.',
  },
  {
    icon: <Users size={14} />,
    name: 'Manager Insights',
    blurb: 'Team readiness + at-risk learners.',
  },
];

const IQ_STACK = [
  { label: 'Work IQ', tone: 'work' },
  { label: 'Foundry IQ', tone: 'foundry' },
  { label: 'Fabric IQ', tone: 'fabric' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!', { duration: 2500 });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message;
      const friendly =
        status === 401
          ? 'Invalid email or password.'
          : status === 0 || err?.code === 'ERR_NETWORK'
          ? 'Cannot reach the server. Check your connection and try again.'
          : detail || 'Something went wrong. Please try again.';
      toast.error(friendly, { title: 'Sign-in failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden="true" />
      <div className="login-shell">
        {/* ── Left: pitch ────────────────────────────────────── */}
        <aside className="login-hero">
          <div className="login-brand">
            <span className="login-brand-mark">
              <GraduationCap size={18} />
            </span>
            <span className="login-brand-text">
              Enterprise Learning System
            </span>
          </div>

          <h2 className="login-hero-title">
            Master the cert.
            <br />
            <span className="login-hero-accent">Confident. Capable. Certified.</span>
          </h2>

          <p className="login-hero-lede">
            An AI-powered internal certification-prep platform — five
            specialist agents give every employee a personalised, work-aware,
            grounded path, and give managers real visibility into team
            readiness.
          </p>

          <ul className="login-agents">
            {AGENTS.map((a) => (
              <li key={a.name} className="login-agent">
                <span className="login-agent-icon">{a.icon}</span>
                <div>
                  <div className="login-agent-name">{a.name}</div>
                  <div className="login-agent-blurb">{a.blurb}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="login-iq-row">
            <span className="login-iq-prefix">Grounded in</span>
            {IQ_STACK.map((iq) => (
              <span key={iq.label} className={`login-iq-chip iq-${iq.tone}`}>
                {iq.label}
              </span>
            ))}
          </div>
        </aside>

        {/* ── Right: form ────────────────────────────────────── */}
        <section className="login-form-pane">
          <div className="login-card">
            <div className="login-card-header">
              <h1>Welcome back</h1>
              <p className="subtitle">Sign in to continue your learning journey</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="login-card-roles">
              <span className="login-role-chip">Learner</span>
              <span className="login-role-chip">Manager</span>
              <span className="login-role-chip">Admin</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
