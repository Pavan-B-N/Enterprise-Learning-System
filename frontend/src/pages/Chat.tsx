import { useState, useRef, useEffect, useCallback, FormEvent, KeyboardEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import apiClient from '../api/client';
import { extractErrorMessage } from '../components/ErrorBanner';
import {
  Send, Sparkles, BookOpen, Mic, MicOff, Trash2, Copy, Check,
  Calendar, Target, Brain, TrendingUp, Heart, Clock, Bot,
  Plus, MessageSquare, Search, Pencil, X, MoreVertical, History,
  Loader2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  listConversations,
  createConversation,
  listMessages,
  appendMessages,
  renameConversation as apiRenameConversation,
  deleteConversation as apiDeleteConversation,
  Conversation,
} from '../api/chat';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
  isError?: boolean;
}

// ── Citation parsing ─────────────────────────────────────────────────────
// Foundry IQ tokens look like: 【msg_idx:src_idx†source_name.md】 (Japanese
// brackets, dagger separator). We strip them out of the body, dedupe by
// source name, and surface them as numbered footnotes below the message.
const CITATION_RE = /【[^†】]*†([^】]+)】/g;
const SUPERSCRIPTS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function toSuperscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPTS[+d] || d)
    .join('');
}

function extractCitations(raw: string): { body: string; sources: string[] } {
  if (!raw) return { body: '', sources: [] };
  const sources: string[] = [];
  const seen = new Map<string, number>();
  const body = raw.replace(CITATION_RE, (_m, name: string) => {
    const key = String(name).trim();
    if (!key) return '';
    let n = seen.get(key);
    if (!n) {
      n = sources.length + 1;
      seen.set(key, n);
      sources.push(key);
    }
    return ` ${toSuperscript(n)}`;
  });
  return { body, sources };
}

const RECOMMENDED_PROMPTS = [
  {
    label: 'Create a study plan',
    prompt: 'Create a study plan for my target certification',
    hint: 'Build a week-by-week roadmap',
    icon: Calendar,
    color: '#16a34a',
  },
  {
    label: 'Recommend resources',
    prompt: 'What learning resources do you recommend for my current certification path?',
    hint: 'Top materials for your level',
    icon: BookOpen,
    color: '#3b82f6',
  },
  {
    label: 'Practice questions',
    prompt: 'Give me practice questions for my target exam',
    hint: 'Quiz yourself on key topics',
    icon: Brain,
    color: '#8b5cf6',
  },
  {
    label: 'Check my readiness',
    prompt: 'How ready am I for my upcoming certification exam?',
    hint: 'Get an honest readiness signal',
    icon: Target,
    color: '#ef4444',
  },
  {
    label: 'Motivation boost',
    prompt: 'How am I progressing? Give me a motivation boost!',
    hint: 'A pep-talk on demand',
    icon: Heart,
    color: '#ea580c',
  },
  {
    label: 'Weekly schedule',
    prompt: 'Help me create a weekly study schedule that fits 5 hours per week',
    hint: 'Time-boxed study slots',
    icon: Clock,
    color: '#06b6d4',
  },
];

// Web Speech API (browser-only, Chromium/WebKit)
type SpeechRecognitionCtor = new () => any;
const SpeechRecognitionImpl: SpeechRecognitionCtor | undefined =
  (typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
  undefined;

export default function Chat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { convId: urlConvId } = useParams<{ convId?: string }>();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convsLoading, setConvsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const baseInputRef = useRef<string>('');
  const lastLoadedConvId = useRef<string | null>(null);
  const activeConvIdRef = useRef<string | null>(urlConvId ?? null);

  const certContext = (location.state as any)?.certContext;
  const contextApplied = useRef(false);

  // Keep ref in sync with URL
  useEffect(() => {
    activeConvIdRef.current = urlConvId ?? null;
  }, [urlConvId]);

  // Load conversation list on mount and whenever the URL conv id changes (so newly
  // created conversations show up in the sidebar)
  const refreshConversations = useCallback(async () => {
    try {
      const list = await listConversations();
      setConversations(list);
    } catch {
      /* network errors handled at call-site if needed */
    } finally {
      setConvsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Load messages when URL conv id changes
  useEffect(() => {
    let cancelled = false;
    const loadFor = async (id: string | undefined) => {
      if (!id) {
        setMessages([]);
        lastLoadedConvId.current = null;
        return;
      }
      if (id === lastLoadedConvId.current) return;
      lastLoadedConvId.current = id;
      setMsgsLoading(true);
      try {
        const rows = await listMessages(id);
        if (cancelled) return;
        setMessages(
          rows.map((r) => ({
            role: r.role,
            content: r.content,
            agent: r.agent || undefined,
            isError: !!r.is_error,
          })),
        );
      } catch (e: any) {
        if (cancelled) return;
        const status = e?.response?.status;
        if (status === 404) {
          setMessages([]);
          navigate('/chat', { replace: true });
          return;
        }
        const msg = extractErrorMessage(e, 'Failed to load conversation.');
        setMessages([{ role: 'assistant', content: `⚠️ ${msg}`, isError: true }]);
      } finally {
        if (!cancelled) setMsgsLoading(false);
      }
    };
    loadFor(urlConvId);
    return () => { cancelled = true; };
  }, [urlConvId, navigate]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, msgsLoading]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  // Auto-send context message when arriving from certifications page
  useEffect(() => {
    if (certContext && !contextApplied.current) {
      contextApplied.current = true;
      const autoMsg = `I want to discuss the ${certContext.cert_name} certification${certContext.cert_id ? ` (${certContext.cert_id})` : ''}${certContext.level ? `, ${certContext.level} level` : ''}. ${certContext.status ? `I'm currently ${certContext.status.replace('_', ' ')}.` : ''} What should I focus on?`;
      sendMessage(autoMsg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certContext]);

  // Stop recognition on unmount
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop?.(); } catch { /* noop */ }
    };
  }, []);

  // Close action menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [menuOpenId]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    // Ensure we have a conversation id
    let convId = activeConvIdRef.current;
    let createdNew = false;
    try {
      if (!convId) {
        const created = await createConversation();
        convId = created.id;
        createdNew = true;
        activeConvIdRef.current = convId;
        lastLoadedConvId.current = convId; // suppress reload effect
        setConversations((prev) => [created, ...prev]);
        navigate(`/chat/${convId}`, { replace: true });
      }
    } catch (e: any) {
      const msg = extractErrorMessage(e, 'Could not start a new conversation.');
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${msg}`, isError: true }]);
      setSending(false);
      return;
    }

    let assistantMsg: Message;
    try {
      const res = await apiClient.post('/api/orchestrator/chat', { message: text });
      const data = res.data;
      const errEnvelope = data?.error;
      const errMsg = errEnvelope
        ? `[${errEnvelope.status_code || 500}] ${errEnvelope.message || 'Agent error'}`
        : null;
      const responseText = typeof data?.response === 'string'
        ? data.response
        : (data?.response?.output || JSON.stringify(data?.response || data));
      assistantMsg = {
        role: 'assistant',
        content: errMsg ? `⚠️ ${errMsg}\n\n${responseText}` : responseText,
        agent: data?.agent,
        isError: !!errEnvelope,
      };
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = extractErrorMessage(e, 'Sorry, an error occurred. Please try again.');
      const prefix = status ? `⚠️ [${status}] ` : '⚠️ ';
      assistantMsg = { role: 'assistant', content: `${prefix}${msg}`, isError: true };
    }

    setMessages((prev) => [...prev, assistantMsg]);
    setSending(false);

    // Persist (best-effort) — fire-and-forget refresh of conversation list afterwards
    if (convId) {
      try {
        const result = await appendMessages(convId, [
          { role: 'user', content: userMsg.content },
          {
            role: 'assistant',
            content: assistantMsg.content,
            agent: assistantMsg.agent || null,
            is_error: !!assistantMsg.isError,
          },
        ]);
        // Update sidebar with refreshed conversation metadata (title may have changed)
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== result.conversation.id);
          return [result.conversation, ...next];
        });
      } catch (e) {
        console.error('Failed to persist chat messages', e);
      }
      if (createdNew) refreshConversations();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startRecording = () => {
    if (!SpeechRecognitionImpl) {
      alert('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    try {
      const rec = new SpeechRecognitionImpl();
      rec.lang = navigator.language || 'en-US';
      rec.continuous = true;
      rec.interimResults = true;

      baseInputRef.current = input ? input.trimEnd() + ' ' : '';

      rec.onresult = (event: any) => {
        let interim = '';
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += transcript;
          else interim += transcript;
        }
        if (finalText) {
          baseInputRef.current = (baseInputRef.current + finalText).replace(/\s+/g, ' ');
          setInput(baseInputRef.current);
        } else {
          setInput((baseInputRef.current + interim).trim());
        }
      };
      rec.onerror = () => setRecording(false);
      rec.onend = () => setRecording(false);

      recognitionRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (err) {
      console.error('Speech recognition failed', err);
      setRecording(false);
    }
  };

  const stopRecording = () => {
    try { recognitionRef.current?.stop?.(); } catch { /* noop */ }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  const copyMessage = async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch { /* noop */ }
  };

  const clearChat = async () => {
    if (sending) return;
    if (!urlConvId) {
      setMessages([]);
      return;
    }
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await apiDeleteConversation(urlConvId);
    } catch {
      /* still navigate away */
    }
    setConversations((prev) => prev.filter((c) => c.id !== urlConvId));
    setMessages([]);
    lastLoadedConvId.current = null;
    activeConvIdRef.current = null;
    navigate('/chat', { replace: true });
  };

  const newChat = () => {
    if (sending) return;
    setMessages([]);
    setInput('');
    lastLoadedConvId.current = null;
    activeConvIdRef.current = null;
    navigate('/chat');
  };

  const selectConversation = (id: string) => {
    if (sending || id === urlConvId) return;
    setMenuOpenId(null);
    navigate(`/chat/${id}`);
  };

  const beginRename = (conv: Conversation) => {
    setMenuOpenId(null);
    setRenamingId(conv.id);
    setRenameDraft(conv.title || '');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const submitRename = async () => {
    const id = renamingId;
    const title = renameDraft.trim();
    if (!id) return;
    if (!title) {
      cancelRename();
      return;
    }
    try {
      const updated = await apiRenameConversation(id, title);
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch {
      /* best-effort */
    } finally {
      cancelRename();
    }
  };

  const deleteConv = async (id: string) => {
    setMenuOpenId(null);
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    const wasActive = id === urlConvId;
    try {
      await apiDeleteConversation(id);
    } catch {
      /* fall through and update UI optimistically */
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (wasActive) {
      setMessages([]);
      lastLoadedConvId.current = null;
      activeConvIdRef.current = null;
      navigate('/chat', { replace: true });
    }
  };

  const voiceSupported = !!SpeechRecognitionImpl;
  const showWelcome = messages.length === 0 && !certContext && !msgsLoading;

  const filteredConversations = (() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.title || '').toLowerCase().includes(q));
  })();

  const formatRelative = (iso?: string) => {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const diff = (Date.now() - t) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className={`chat-shell${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      <div className="chat-container">
        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-title">
            <div className="chat-header-icon">
              <Bot size={20} />
            </div>
            <div className="chat-header-text">
              <div className="title">
                ELS Assistant
                <span className="live-dot" title="All agents online" />
              </div>
              <div className="subtitle">Curator · Planner · Engagement · Insights · Assessment</div>
            </div>
          </div>
          <div className="chat-header-actions">
            <button
              type="button"
              className="chat-header-btn primary"
              onClick={newChat}
              disabled={sending}
              title="Start a new conversation"
            >
              <Plus size={14} /> New chat
            </button>
            <button
              type="button"
              className="chat-msg-action-btn"
              style={{ width: 32, height: 32 }}
              onClick={clearChat}
              disabled={(messages.length === 0 && !urlConvId) || sending}
              title={urlConvId ? 'Delete this conversation' : 'Clear draft'}
            >
              <Trash2 size={14} />
            </button>
            <button
              type="button"
              className={`chat-msg-action-btn${sidebarOpen ? ' active' : ''}`}
              style={{ width: 32, height: 32 }}
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? 'Hide history' : 'Show history'}
              aria-pressed={sidebarOpen}
            >
              <History size={14} />
            </button>
          </div>
        </div>

      {/* Messages */}
      <div className="chat-messages">
        {certContext && (
          <div style={{ padding: '0.6rem 1rem', margin: '0 0 0.5rem', background: 'var(--accent-subtle)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--accent-primary)' }}>
            <BookOpen size={14} />
            <span>Context: <strong>{certContext.cert_name}</strong></span>
            {certContext.mode === 'practice_exam' && <span className="badge in-progress" style={{ fontSize: '0.65rem' }}>Practice Exam</span>}
            {certContext.mode === 'module_quiz' && <span className="badge in-progress" style={{ fontSize: '0.65rem' }}>Module Assessment</span>}
          </div>
        )}

        {showWelcome && (
          <div className="chat-welcome">
            <div className="chat-welcome-hero">
              <div className="chat-welcome-icon">
                <Sparkles size={28} />
              </div>
              <h3>How can I help you learn today?</h3>
              <p>
                Ask about certifications, study plans, practice questions, or anything else on your
                learning journey. Our AI agents are here to help.
              </p>
            </div>
            <div className="chat-prompt-grid">
              {RECOMMENDED_PROMPTS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.label}
                    type="button"
                    className="chat-prompt-card"
                    onClick={() => sendMessage(p.prompt)}
                  >
                    <div
                      className="prompt-icon"
                      style={{ background: `${p.color}1a`, color: p.color }}
                    >
                      <Icon size={15} />
                    </div>
                    <div className="prompt-text">
                      <div className="prompt-label">{p.label}</div>
                      <div className="prompt-hint">{p.hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isAssistant = msg.role === 'assistant';
          const { body: assistantBody, sources: assistantSources } = isAssistant
            ? extractCitations(msg.content)
            : { body: msg.content, sources: [] };
          return (
            <div key={i} className={`chat-msg-row ${msg.role}`}>
              <div className={`chat-avatar ${msg.role}`}>
                {isAssistant ? <Sparkles size={15} /> : 'You'}
              </div>
              <div className={`chat-msg-bubble ${msg.role}${msg.isError ? ' error-bubble' : ''}`}>
                {isAssistant && msg.agent && (
                  <div className="agent-chip-inline">
                    <Bot size={10} /> {msg.agent} agent
                  </div>
                )}
                {isAssistant ? (
                  <>
                    <div className="rendered-md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{assistantBody}</ReactMarkdown>
                    </div>
                    {assistantSources.length > 0 && (
                      <div className="chat-sources-block">
                        <div className="chat-sources-title">
                          <BookOpen size={11} /> Sources
                        </div>
                        <ol className="chat-sources-list">
                          {assistantSources.map((src, idx) => (
                            <li key={idx}>
                              <span className="citation-num">[{idx + 1}]</span>
                              <span>{src}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                )}
                <div className="chat-msg-actions">
                  <button
                    type="button"
                    className="chat-msg-action-btn"
                    onClick={() => copyMessage(msg.content, i)}
                    title="Copy message"
                  >
                    {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="chat-msg-row assistant">
            <div className="chat-avatar assistant">
              <Sparkles size={15} />
            </div>
            <div className="chat-msg-bubble assistant">
              <div className="typing-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form className="chat-composer" onSubmit={handleSubmit}>
        <div className="chat-composer-inner">
          <textarea
            ref={textareaRef}
            className="chat-composer-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={recording ? 'Listening… speak now' : 'Ask about your learning path… (Shift+Enter for new line)'}
            disabled={sending}
            rows={1}
          />
          <button
            type="button"
            className={`chat-composer-btn mic${recording ? ' recording' : ''}`}
            onClick={toggleRecording}
            disabled={sending || !voiceSupported}
            title={
              !voiceSupported
                ? 'Voice input unsupported in this browser'
                : recording ? 'Stop voice input' : 'Start voice input'
            }
          >
            {recording ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <button
            type="submit"
            className="chat-composer-btn send"
            disabled={sending || !input.trim()}
            title="Send (Enter)"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="chat-composer-hint">
          <span>
            {recording ? (
              <span className="voice-status">
                <span className="rec-dot" /> Listening — click the mic to stop
              </span>
            ) : (
              <>Press <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for newline</>
            )}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <TrendingUp size={11} /> Powered by 5 AI agents
          </span>
        </div>
      </form>
      </div>

      {/* History sidebar */}
      <aside className="chat-sidebar" aria-label="Conversation history">
        <div className="chat-sidebar-head">
          <div className="chat-sidebar-title">
            <MessageSquare size={14} />
            <span>History</span>
            {!convsLoading && (
              <span className="chat-sidebar-count">{conversations.length}</span>
            )}
          </div>
        </div>

        <div className="chat-sidebar-search">
          <Search size={13} />
          <input
            type="text"
            placeholder="Search conversations…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="chat-sidebar-search-clear"
              onClick={() => setSearchTerm('')}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="chat-sidebar-list">
          {convsLoading ? (
            <div className="chat-sidebar-empty">
              <Loader2 size={16} className="spin" /> Loading…
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="chat-sidebar-empty">
              {searchTerm ? 'No matches' : 'No conversations yet — start a new chat to begin.'}
            </div>
          ) : (
            filteredConversations.map((c) => {
              const active = c.id === urlConvId;
              const isRenaming = renamingId === c.id;
              return (
                <div
                  key={c.id}
                  className={`chat-sidebar-item${active ? ' active' : ''}`}
                  onClick={() => !isRenaming && selectConversation(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !isRenaming) {
                      e.preventDefault();
                      selectConversation(c.id);
                    }
                  }}
                >
                  <div className="chat-sidebar-item-main">
                    {isRenaming ? (
                      <input
                        autoFocus
                        className="chat-sidebar-rename-input"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') submitRename();
                          if (e.key === 'Escape') cancelRename();
                        }}
                        onBlur={submitRename}
                        maxLength={120}
                      />
                    ) : (
                      <div className="chat-sidebar-item-title" title={c.title}>{c.title}</div>
                    )}
                    <div className="chat-sidebar-item-meta">
                      <span>{c.message_count} msg{c.message_count === 1 ? '' : 's'}</span>
                      <span>·</span>
                      <span>{formatRelative(c.last_message_at)}</span>
                    </div>
                  </div>
                  {!isRenaming && (
                    <div className="chat-sidebar-item-menu" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="chat-msg-action-btn"
                        style={{ width: 26, height: 26 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === c.id ? null : c.id);
                        }}
                        title="More actions"
                      >
                        <MoreVertical size={12} />
                      </button>
                      {menuOpenId === c.id && (
                        <div className="chat-sidebar-menu">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); beginRename(c); }}
                          >
                            <Pencil size={12} /> Rename
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}

