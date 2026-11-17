'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import { ArrowDown, Check, History, Lock, Pencil, SendHorizontal, X } from 'lucide-react';
import { Avatar } from '@/components/badges';
import { Spinner } from '@/components/ui/misc';
import { toast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { CHAT_PAGE, GROUP_MINUTES, type Message } from '@/lib/chat';
import { editMessage, fetchEdited, fetchMessages, markChatRead, messageHistory, sendMessage } from '@/app/actions/chat';
import { cn } from '@/lib/utils';

type Person = { id: string; full_name: string };
type Local = Message & { pending?: boolean };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

function dayLabel(d: Date) {
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE d MMMM');
}

/** Message text with links and @mentions highlighted. */
function Body({ text, mentionNames, meName }: { text: string; mentionNames: string[]; meName: string }) {
  const names = mentionNames.filter(Boolean).sort((a, b) => b.length - a.length);
  const re = names.length ? new RegExp(`(@(?:${names.map(escapeRe).join('|')}))`, 'g') : null;
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-all">{part}</a>;
        if (!re) return <Fragment key={i}>{part}</Fragment>;
        return part.split(re).map((seg, j) =>
          j % 2 === 1
            ? <span key={`${i}-${j}`} className={cn('rounded px-0.5 font-medium', seg === `@${meName}` ? 'bg-deadline-soft text-deadline' : 'bg-primary/12 text-primary')}>{seg}</span>
            : <Fragment key={`${i}-${j}`}>{seg}</Fragment>);
      })}
    </>
  );
}

function EditedBadge({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ previous_body: string; edited_at: string }[] | null>(null);
  return (
    <span className="relative">
      <button type="button" className="ml-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline" aria-expanded={open}
        onClick={async () => { setOpen((o) => !o); if (!rows) { const r = await messageHistory(message.id); setRows(r.ok ? r.data ?? [] : []); } }}>
        (edited)
      </button>
      {open && (
        <span role="dialog" aria-label="Edit history" className="absolute left-0 top-5 z-20 block w-72 rounded-lg border bg-popover p-3 text-[12.5px] shadow-xl">
          <span className="mb-1.5 flex items-center gap-1.5 font-medium"><History className="size-3.5" aria-hidden />Earlier versions</span>
          {!rows ? <Spinner /> : rows.length === 0 ? <span className="text-muted-foreground">No earlier versions.</span> : (
            <span className="block max-h-56 space-y-2 overflow-y-auto">
              {rows.map((r, i) => (
                <span key={i} className="block border-l-2 border-border-strong pl-2">
                  <span className="block whitespace-pre-wrap break-words text-foreground/85">{r.previous_body}</span>
                  <span className="block text-[11px] text-muted-foreground">replaced {format(new Date(r.edited_at), 'd MMM, HH:mm')}</span>
                </span>
              ))}
            </span>
          )}
          <button type="button" onClick={() => setOpen(false)} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground" aria-label="Close"><X className="size-3.5" /></button>
        </span>
      )}
    </span>
  );
}

export function ChatRoom({ conversationId, initial, people, meId, mentionable, placeholder, emptyHint, readOnly }: {
  conversationId: string;
  initial: Message[];
  people: Person[];
  meId: string;
  /** People who can be @mentioned (project chats). Empty for DMs. */
  mentionable: Person[];
  placeholder: string;
  emptyHint: string;
  readOnly?: string;
}) {
  const peopleMap = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const me = peopleMap.get(meId);
  const [messages, setMessages] = useState<Local[]>(initial);
  const [hasOlder, setHasOlder] = useState(initial.length >= CHAT_PAGE);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Person[]>([]);
  const [picker, setPicker] = useState<{ query: string; start: number; index: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [newBelow, setNewBelow] = useState(0);
  const [live, setLive] = useState(false);
  const [sending, startSend] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const lastPoll = useRef(new Date().toISOString());
  const preserveFrom = useRef<number | null>(null);
  const pendingCaret = useRef<number | null>(null);

  const merge = useCallback((rows: Message[]) => {
    if (!rows.length) return;
    setMessages((cur) => {
      const map = new Map(cur.filter((m) => !m.pending || !rows.some((r) => r.author_id === m.author_id && r.body === m.body)).map((m) => [m.id, m]));
      let added = 0;
      for (const r of rows) { if (!map.has(r.id) && r.author_id !== meId) added++; map.set(r.id, r); }
      if (added && !atBottom.current) setNewBelow((n) => n + added);
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, [meId]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current; if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(0);
  }, []);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    if (preserveFrom.current != null) { el.scrollTop = el.scrollHeight - preserveFrom.current; preserveFrom.current = null; return; }
    if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Read marker.
  const lastId = messages[messages.length - 1]?.id;
  const router = useRouter();
  const refreshedBadges = useRef(false);
  useEffect(() => {
    if (document.visibilityState !== 'visible' || !atBottom.current) return;
    markChatRead(conversationId).then(() => {
      // Clear the unread badges in the sidebar once, after opening the chat.
      if (!refreshedBadges.current) { refreshedBadges.current = true; router.refresh(); }
    }, () => {});
  }, [conversationId, lastId, router]);

  // Live updates: Supabase Realtime, with polling as a safety net.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => { if (payload.new && 'id' in payload.new) merge([payload.new as Message]); })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, merge]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const since = lastPoll.current; lastPoll.current = new Date().toISOString();
      const last = messages.filter((m) => !m.pending).at(-1)?.created_at;
      try {
        const [fresh, edited] = await Promise.all([fetchMessages(conversationId, { after: last ?? since }), fetchEdited(conversationId, since)]);
        if (!stop) merge([...fresh, ...edited]);
      } catch { lastPoll.current = since; /* offline or signed out: try again next tick */ }
    };
    const t = setInterval(tick, live ? 30000 : 4000);
    const onVis = () => { if (document.visibilityState === 'visible') { void tick(); if (atBottom.current) markChatRead(conversationId).catch(() => {}); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [conversationId, live, merge, messages]);

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (bottom && !atBottom.current) { setNewBelow(0); markChatRead(conversationId).catch(() => {}); }
    atBottom.current = bottom;
  };

  const loadOlder = async () => {
    const first = messages.find((m) => !m.pending); if (!first) return;
    setLoadingOlder(true);
    const older = await fetchMessages(conversationId, { before: first.created_at });
    preserveFrom.current = scroller.current ? scroller.current.scrollHeight - scroller.current.scrollTop : null;
    setHasOlder(older.length >= CHAT_PAGE);
    setLoadingOlder(false);
    merge(older);
  };

  // --- Composer ---
  const pickerOptions = useMemo(() => {
    if (!picker) return [];
    const q = picker.query.toLowerCase();
    return mentionable.filter((p) => p.id !== meId && p.full_name.toLowerCase().includes(q)).slice(0, 6);
  }, [picker, mentionable, meId]);

  const updatePicker = (value: string, caret: number) => {
    if (!mentionable.length) return setPicker(null);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setPicker(m ? { query: m[2], start: caret - m[2].length - 1, index: 0 } : null);
  };

  const choose = (p: Person) => {
    if (!picker || !input.current) return;
    const caret = input.current.selectionStart;
    const next = `${text.slice(0, picker.start)}@${p.full_name} ${text.slice(caret)}`;
    setText(next); setPicker(null);
    setMentions((cur) => (cur.some((c) => c.id === p.id) ? cur : [...cur, p]));
    pendingCaret.current = picker.start + p.full_name.length + 2;
  };

  const send = () => {
    const body = text.trim();
    if (!body || sending) return;
    const ids = mentions.filter((p) => body.includes(`@${p.full_name}`)).map((p) => p.id);
    const temp: Local = { id: `tmp-${Date.now()}`, conversation_id: conversationId, author_id: meId, body, mentions: ids, edited_at: null, created_at: new Date().toISOString(), pending: true };
    atBottom.current = true;
    setMessages((cur) => [...cur, temp]);
    setText(''); setMentions([]); setPicker(null);
    startSend(async () => {
      const r = await sendMessage({ conversation_id: conversationId, body, mentions: ids });
      if (!r.ok || !r.data) {
        setMessages((cur) => cur.filter((m) => m.id !== temp.id));
        setText(body); toast.error(r.ok ? 'Message not sent' : r.error);
        return;
      }
      const saved = r.data;
      setMessages((cur) => [...cur.filter((m) => m.id !== temp.id && m.id !== saved.id), saved].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body = editing.body.trim();
    const orig = messages.find((m) => m.id === editing.id);
    if (!body || body === orig?.body) { setEditing(null); return; }
    const r = await editMessage(editing.id, body);
    if (!r.ok || !r.data) { toast.error(r.ok ? 'Could not save' : r.error); return; }
    merge([r.data]); setEditing(null);
    requestAnimationFrame(() => input.current?.focus());
  };

  // Auto-grow the composer.
  useLayoutEffect(() => {
    const el = input.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    if (pendingCaret.current != null) { el.focus(); el.setSelectionRange(pendingCaret.current, pendingCaret.current); pendingCaret.current = null; }
  }, [text]);

  const mentionNames = useMemo(() => people.map((p) => p.full_name), [people]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-live="polite" aria-label="Messages">
        {hasOlder && (
          <div className="mb-3 text-center">
            <button type="button" onClick={loadOlder} disabled={loadingOlder} className="rounded-full border border-border-strong px-3 py-1 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <p className="max-w-xs text-[13px] text-muted-foreground">{emptyHint}</p>
          </div>
        )}
        <ol className="space-y-0.5">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const d = new Date(m.created_at);
            const newDay = !prev || !isSameDay(new Date(prev.created_at), d);
            const grouped = !newDay && prev?.author_id === m.author_id && d.getTime() - new Date(prev.created_at).getTime() < GROUP_MINUTES * 60000;
            const author = peopleMap.get(m.author_id) ?? { id: m.author_id, full_name: 'Former member' };
            const mine = m.author_id === meId;
            const mentionsMe = m.mentions?.includes(meId);
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <li className="my-3 flex items-center gap-3 text-[11.5px] text-muted-foreground" aria-hidden>
                    <span className="h-px flex-1 bg-border" />{dayLabel(d)}<span className="h-px flex-1 bg-border" />
                  </li>
                )}
                <li className={cn('group relative flex gap-2.5 rounded-md px-2 py-1 hover:bg-foreground/[0.025]', !grouped && 'mt-2', mentionsMe && 'bg-deadline-soft/40', m.pending && 'opacity-60')} data-message={m.id}>
                  <span className="w-7 shrink-0">{!grouped && <Avatar person={author} size="md" />}</span>
                  <div className="min-w-0 flex-1">
                    {!grouped && (
                      <p className="flex items-baseline gap-2 text-[13px]">
                        <span className="font-semibold">{mine ? 'You' : author.full_name}</span>
                        <time className="text-[11px] text-muted-foreground" dateTime={m.created_at} suppressHydrationWarning>{format(d, 'HH:mm')}</time>
                      </p>
                    )}
                    {editing?.id === m.id ? (
                      <div className="mt-1">
                        <textarea autoFocus value={editing.body} onChange={(e) => setEditing({ id: m.id, body: e.target.value })} rows={Math.min(8, editing.body.split('\n').length + 1)} maxLength={4000}
                          aria-label="Edit message"
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void saveEdit(); } if (e.key === 'Escape') setEditing(null); }}
                          className="w-full resize-none rounded-md border border-input bg-card px-2.5 py-1.5 text-[13.5px] outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20" />
                        <p className="mt-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                          <button type="button" onClick={() => void saveEdit()} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><Check className="size-3" />Save</button>
                          <button type="button" onClick={() => setEditing(null)} className="hover:underline">Cancel</button>
                          <span>Enter to save · Esc to cancel · the earlier text stays in the edit history</span>
                        </p>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-foreground/90">
                        <Body text={m.body} mentionNames={mentionNames} meName={me?.full_name ?? ''} />
                        {m.edited_at && <EditedBadge message={m} />}
                        {grouped && <time className="ml-2 hidden text-[10.5px] text-muted-foreground group-hover:inline" dateTime={m.created_at} suppressHydrationWarning>{format(d, 'HH:mm')}</time>}
                      </p>
                    )}
                  </div>
                  {mine && !m.pending && editing?.id !== m.id && !readOnly && (
                    <button type="button" onClick={() => setEditing({ id: m.id, body: m.body })} aria-label="Edit message"
                      className="absolute right-2 top-1 grid size-7 place-items-center rounded-md border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100">
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </div>
      {newBelow > 0 && (
        <div className="relative">
          <button type="button" onClick={() => scrollToBottom(true)} className="absolute -top-11 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground shadow-lg">
            <ArrowDown className="size-3.5" />{newBelow} new {newBelow === 1 ? 'message' : 'messages'}
          </button>
        </div>
      )}
      {readOnly ? (
        <p className="border-t px-4 py-3 text-[12.5px] text-muted-foreground">{readOnly}</p>
      ) : (
        <form className="relative border-t p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {picker && pickerOptions.length > 0 && (
            <ul role="listbox" aria-label="Mention someone" className="absolute bottom-full left-3 z-20 mb-1 w-64 overflow-hidden rounded-lg border bg-popover p-1 shadow-xl">
              {pickerOptions.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === picker.index}>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                    className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]', i === picker.index ? 'bg-muted' : 'hover:bg-muted/60')}>
                    <Avatar person={p} /> {p.full_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2 rounded-lg border border-input bg-card px-2.5 py-1.5 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
            <textarea
              ref={input}
              value={text}
              rows={1}
              maxLength={4000}
              placeholder={placeholder}
              aria-label="Message"
              onChange={(e) => { setText(e.target.value); updatePicker(e.target.value, e.target.selectionStart); }}
              onKeyDown={(e) => {
                if (picker && pickerOptions.length) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setPicker({ ...picker, index: (picker.index + 1) % pickerOptions.length }); return; }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setPicker({ ...picker, index: (picker.index - 1 + pickerOptions.length) % pickerOptions.length }); return; }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(pickerOptions[picker.index]); return; }
                  if (e.key === 'Escape') { e.preventDefault(); setPicker(null); return; }
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); return; }
                if (e.key === 'ArrowUp' && !text) {
                  const last = [...messages].reverse().find((m) => m.author_id === meId && !m.pending);
                  if (last) { e.preventDefault(); setEditing({ id: last.id, body: last.body }); }
                }
              }}
              className="max-h-[180px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[13.5px] outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" disabled={!text.trim() || sending} aria-label="Send message"
              className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-opacity disabled:opacity-40">
              {sending ? <Spinner /> : <SendHorizontal className="size-4" />}
            </button>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="size-3" aria-hidden />
            Enter to send · Shift+Enter for a new line{mentionable.length ? ' · @ to mention' : ''} · ↑ to edit your last message · messages can be edited but not deleted
          </p>
        </form>
      )}
    </div>
  );
}
