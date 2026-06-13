import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import {
  AppNotification,
  listNotifications,
  markAllRead,
  markRead,
} from '../api/notifications';
import { useLiveEvents } from '../hooks/useLiveEvents';

const TYPE_ICON: Record<string, JSX.Element> = {
  assessment_ready: <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />,
  assessment_failed: <AlertTriangle size={14} style={{ color: '#ef4444' }} />,
};

function timeAgo(iso: string): string {
  if (!iso) return '';
  // Treat strings without an explicit timezone as UTC — backend stores BSON
  // Date which round-trips as naive UTC, and JS would otherwise parse it as
  // local time and skew "now" by the user's UTC offset.
  const hasTz = /Z|[+-]\d{2}:?\d{2}$/.test(iso);
  const ts = hasTz ? iso : `${iso}Z`;
  let ms = Date.now() - new Date(ts).getTime();
  if (ms < 0) ms = 0; // clock-skew safety: never show "in the future"
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const refresh = async () => {
    try {
      const r = await listNotifications(30);
      setItems(r.items);
      setUnread(r.unread_count);
    } catch {
      /* gateway might still be coming up */
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useLiveEvents((evt) => {
    if (evt.event !== 'notification') return;
    const n: AppNotification = evt.data;
    if (!n) return;
    setItems((prev) => [n, ...prev].slice(0, 30));
    setUnread((u) => u + 1);
  });

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const onItem = async (n: AppNotification) => {
    if (!n.read) {
      try {
        await markRead(n.id);
        setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
        setUnread((u) => Math.max(0, u - 1));
      } catch { /* ignore */ }
    }
    setOpen(false);
    // Route based on notification type/metadata.
    if (n.type === 'assessment_ready' && n.metadata?.schedule_id) {
      navigate(`/assessments/${n.metadata.schedule_id}`);
    } else if (n.type === 'assessment_failed') {
      navigate('/assessments/schedule');
    }
  };

  const onMarkAll = async () => {
    try {
      await markAllRead();
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnread(0);
    } catch { /* ignore */ }
  };

  return (
    <div className="notif-bell-wrap" ref={dropdownRef}>
      <button
        className="notif-bell-button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="notif-bell-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="notif-mark-all" onClick={onMarkAll}>
                Mark all read
              </button>
            )}
            <button
              className="notif-close-btn"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <div className="notif-dropdown-body">
            {items.length === 0 ? (
              <div className="notif-empty">
                <Bell size={22} style={{ color: 'var(--text-tertiary)' }} />
                <p>You're all caught up.</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  className={`notif-item${n.read ? '' : ' unread'}`}
                  onClick={() => onItem(n)}
                  type="button"
                >
                  <div className="notif-icon">
                    {TYPE_ICON[n.type] || <Info size={14} style={{ color: 'var(--accent-primary)' }} />}
                  </div>
                  <div className="notif-text">
                    <div className="notif-title">{n.title}</div>
                    <div className="notif-message">{n.message}</div>
                    <div className="notif-time">{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.read && <span className="notif-dot" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
