import { AlertTriangle, X } from 'lucide-react';

/** Extract a user-friendly error message from an axios error or any thrown value. */
export function extractErrorMessage(err: any, fallback = 'Something went wrong'): string {
  if (!err) return fallback;
  // Axios style: server returned a JSON body. FastAPI's HTTPException uses `detail`.
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  // Some endpoints might return { error: "..." }
  const errField = err?.response?.data?.error;
  if (typeof errField === 'string' && errField.trim()) return errField;
  // Network / unknown
  if (err?.message) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

interface ErrorBannerProps {
  message: string | null;
  onDismiss?: () => void;
  /** Optional accent color (defaults to red). */
  tone?: 'red' | 'amber';
}

export default function ErrorBanner({ message, onDismiss, tone = 'red' }: ErrorBannerProps) {
  if (!message) return null;
  const color = tone === 'amber' ? '#d97706' : '#dc2626';
  const bg = tone === 'amber' ? 'rgba(217, 119, 6, 0.08)' : 'rgba(220, 38, 38, 0.08)';
  const border = tone === 'amber' ? 'rgba(217, 119, 6, 0.25)' : 'rgba(220, 38, 38, 0.25)';
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '0.6rem 0.75rem',
        marginBottom: '0.75rem',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 'var(--radius-sm)',
        color,
        fontSize: '0.8rem',
        lineHeight: 1.45,
      }}
    >
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
      <div style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
