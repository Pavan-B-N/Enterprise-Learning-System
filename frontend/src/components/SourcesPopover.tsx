import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info, BookOpen, Activity, Database, Briefcase, Flame, Target, ExternalLink } from 'lucide-react';

export interface AgentSource {
  title: string;
  kind?: 'kb' | 'assessment' | 'progress' | 'role' | 'signal' | 'preference' | 'streak' | 'topic' | string;
  url?: string;
  kb?: string;
  snippet?: string;
}

interface Props {
  sources: AgentSource[] | undefined | null;
  /** Inline label shown next to the icon. Omit for icon-only. */
  label?: string;
  /** Visual size. */
  size?: 'sm' | 'md';
}

const KIND_META: Record<string, { icon: typeof Info; color: string; label: string }> = {
  kb:         { icon: BookOpen, color: '#2563eb', label: 'Knowledge base' },
  topic:      { icon: BookOpen, color: '#2563eb', label: 'Course topic' },
  assessment: { icon: Target,   color: '#dc2626', label: 'Assessment' },
  progress:   { icon: Activity, color: '#16a34a', label: 'Progress' },
  signal:     { icon: Database, color: '#7c3aed', label: 'Work signal' },
  preference: { icon: Database, color: '#7c3aed', label: 'Preference' },
  role:       { icon: Briefcase, color: '#0891b2', label: 'Role mapping' },
  streak:     { icon: Flame,    color: '#ea580c', label: 'Streak' },
};

function meta(kind?: string) {
  return KIND_META[kind || ''] || { icon: Info, color: 'var(--text-tertiary)', label: 'Source' };
}

/**
 * Small (i) info button that reveals the agent's grounding sources on click.
 * Click outside or press Escape to dismiss.
 */
export default function SourcesPopover({ sources, label, size = 'sm' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const popoverWidth = 320;
    // Anchor to button's bottom-right; clamp inside viewport.
    let left = rect.right - popoverWidth;
    if (left < 8) left = 8;
    if (left + popoverWidth > window.innerWidth - 8) left = window.innerWidth - popoverWidth - 8;
    const top = rect.bottom + 6;
    setPos({ top, left });
  }, [open]);

  if (!sources || !Array.isArray(sources) || sources.length === 0) return null;

  const iconSize = size === 'md' ? 14 : 12;

  return (
    <span ref={ref} className="sources-popover-wrap">
      <button
        type="button"
        className={`sources-info-btn size-${size}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label={`Show ${sources.length} source${sources.length === 1 ? '' : 's'}`}
        aria-expanded={open}
        title={`${sources.length} source${sources.length === 1 ? '' : 's'}`}
      >
        <Info size={iconSize} />
        {label && <span className="sources-info-label">{label}</span>}
      </button>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="sources-popover sources-popover-floating"
          role="dialog"
          aria-label="Agent sources"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="sources-popover-header">
            <span>Sources</span>
            <span className="sources-count">{sources.length}</span>
          </div>
          <ul>
            {sources.map((s, i) => {
              const m = meta(s.kind);
              const Icon = m.icon;
              return (
                <li key={i}>
                  <span className="src-icon" style={{ color: m.color }}>
                    <Icon size={12} />
                  </span>
                  <span className="src-body">
                    <span className="src-title">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title} <ExternalLink size={10} />
                        </a>
                      ) : (
                        s.title
                      )}
                    </span>
                    <span className="src-meta">
                      <span className="src-kind" style={{ color: m.color }}>{m.label}</span>
                      {s.kb && <span className="src-kb">{s.kb}</span>}
                    </span>
                    {s.snippet && <span className="src-snippet">{s.snippet}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body
      )}
    </span>
  );
}
