'use client';

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BellOff,
  Check,
  CheckCheck,
  CornerUpLeft,
  Flag,
  MoreVertical,
  Paperclip,
  Pencil,
  Search,
  Send,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError, uploadFile } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { formatTime } from '@/lib/format';
import { useSession } from '@/hooks/use-session';
import { useSocket } from '@/hooks/use-socket';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, Textarea } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn, formatBytes } from '@/lib/utils';
import { IMAGE_MIME_TYPES } from '@yurei/shared';
import type { ConversationDTO, MessageDTO, Paginated, UploadResult } from '@yurei/shared';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

interface PendingAttachment extends UploadResult {
  uploading?: boolean;
}

export function Chat({ conversationId }: { conversationId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const { user } = useSession();
  const { socket, presenceOf } = useSocket();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<MessageDTO | null>(null);
  const [editing, setEditing] = useState<MessageDTO | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<MessageDTO | null>(null);
  const [reportTarget, setReportTarget] = useState<MessageDTO | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<MessageDTO[]>([]);
  const [otherLastRead, setOtherLastRead] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: conversations } = useQuery<ConversationDTO[]>({
    queryKey: ['conversations'],
    queryFn: () => api('/conversations'),
  });
  const conversation = conversations?.find((c) => c.id === conversationId);

  const markRead = useCallback((): void => {
    void api(`/conversations/${conversationId}/read`, { method: 'POST' })
      .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }))
      .catch(() => undefined);
  }, [conversationId, queryClient]);

  // Chargement initial
  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setNextCursor(null);
    void api<Paginated<MessageDTO>>(`/conversations/${conversationId}/messages`)
      .then((page) => {
        if (cancelled) return;
        setMessages(page.items);
        setNextCursor(page.nextCursor);
        markRead();
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
      })
      .catch((err) => toast.error(err instanceof ApiError ? err.message : t.common.error));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Événements temps réel
  useEffect(() => {
    if (!socket) return;
    const onNew = (message: MessageDTO): void => {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      if (message.author.id !== user?.id) markRead();
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
    };
    const onUpdated = (message: MessageDTO): void => {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    };
    const onDeleted = ({ messageId, conversationId: cid }: { messageId: string; conversationId: string }): void => {
      if (cid !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, deletedAt: new Date().toISOString(), content: '', attachments: [] } : m,
        ),
      );
    };
    const onTyping = (payload: { conversationId: string; userId: string; displayName: string; isTyping: boolean }): void => {
      if (payload.conversationId !== conversationId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (payload.isTyping) next[payload.userId] = payload.displayName;
        else delete next[payload.userId];
        return next;
      });
    };
    const onRead = (payload: { conversationId: string; userId: string; at: string }): void => {
      if (payload.conversationId !== conversationId || payload.userId === user?.id) return;
      setOtherLastRead(payload.at);
    };

    socket.on('message.new', onNew);
    socket.on('message.updated', onUpdated);
    socket.on('message.reaction', onUpdated);
    socket.on('message.deleted', onDeleted);
    socket.on('typing', onTyping);
    socket.on('conversation.read', onRead);
    return () => {
      socket.off('message.new', onNew);
      socket.off('message.updated', onUpdated);
      socket.off('message.reaction', onUpdated);
      socket.off('message.deleted', onDeleted);
      socket.off('typing', onTyping);
      socket.off('conversation.read', onRead);
    };
  }, [socket, conversationId, user?.id, markRead]);

  const emitTyping = (isTyping: boolean): void => {
    socket?.emit('typing', { conversationId, isTyping });
  };

  const onDraftChange = (value: string): void => {
    setDraft(value);
    emitTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitTyping(false), 2500);
  };

  const loadMore = async (): Promise<void> => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api<Paginated<MessageDTO>>(
        `/conversations/${conversationId}/messages?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setMessages((prev) => [...page.items, ...prev]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const pickFiles = async (files: FileList | null): Promise<void> => {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 5 - attachments.length)) {
      try {
        const result = await uploadFile(file);
        setAttachments((prev) => [...prev, result]);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t.common.error);
      }
    }
  };

  const send = async (): Promise<void> => {
    const content = draft.trim();
    if ((!content && attachments.length === 0) || sending) return;
    setSending(true);
    emitTyping(false);
    try {
      if (editing) {
        await api(`/messages/${editing.id}`, { method: 'PATCH', body: { content } });
        setEditing(null);
      } else {
        const message = await api<MessageDTO>(`/conversations/${conversationId}/messages`, {
          method: 'POST',
          body: { content, replyToId: replyTo?.id, attachments: attachments.map((a) => a.token) },
        });
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
      }
      setDraft('');
      setReplyTo(null);
      setAttachments([]);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    } finally {
      setSending(false);
    }
  };

  const react = async (message: MessageDTO, emoji: string): Promise<void> => {
    const mine = message.reactions.find((r) => r.emoji === emoji)?.mine;
    try {
      if (mine) {
        await api(`/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' });
      } else {
        await api(`/messages/${message.id}/reactions`, { method: 'POST', body: { emoji } });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    }
  };

  const runSearch = async (): Promise<void> => {
    if (searchQ.trim().length < 2) return;
    try {
      setSearchResults(
        await api<MessageDTO[]>(`/conversations/${conversationId}/search?q=${encodeURIComponent(searchQ)}`),
      );
    } catch {
      setSearchResults([]);
    }
  };

  const typingLabel = Object.values(typingUsers).join(', ');
  const lastMineRead = otherLastRead
    ? [...messages].reverse().find((m) => m.author.id === user?.id && m.createdAt <= otherLastRead)
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* En-tête de conversation */}
      {conversation && (
        <div className="flex items-center gap-3 border-b border-spirit-400/10 px-4 py-3">
          <UserAvatar
            src={conversation.other.avatarUrl}
            name={conversation.other.displayName}
            size={38}
            status={presenceOf(conversation.other.id)}
          />
          <Link href={`/users/${conversation.other.id}`} className="min-w-0 flex-1">
            <span className="block truncate font-medium text-slate-100">{conversation.other.displayName}</span>
            <span className="block text-xs text-slate-500">@{conversation.other.username}</span>
          </Link>
          <Button variant="ghost" size="icon" aria-label={t.messages.searchConversation} onClick={() => setSearchOpen(true)}>
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={conversation.muted ? t.messages.unmute : t.messages.mute}
            className={conversation.muted ? 'text-warning' : undefined}
            onClick={() => {
              void api(`/conversations/${conversationId}/mute`, {
                method: 'POST',
                body: { muted: !conversation.muted },
              }).then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }));
            }}
          >
            <BellOff className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Fil de messages */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {nextCursor && (
          <div className="text-center">
            <Button variant="ghost" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
              {t.messages.loadMore}
            </Button>
          </div>
        )}
        {messages.map((message) => {
          const mine = message.author.id === user?.id;
          return (
            <div key={message.id} className={cn('group flex gap-2.5', mine && 'flex-row-reverse')}>
              <UserAvatar src={message.author.avatarUrl} name={message.author.displayName} size={32} />
              <div className={cn('max-w-[75%] min-w-0', mine && 'items-end text-right')}>
                {message.replyTo && (
                  <p className="mb-0.5 truncate rounded-lg border-l-2 border-spirit-500 bg-night-800/60 px-2 py-1 text-xs text-slate-500">
                    <CornerUpLeft className="mr-1 inline h-3 w-3" aria-hidden />
                    {message.replyTo.authorName}: {message.replyTo.content || `📎 ${t.messages.attachment}`}
                  </p>
                )}
                <div
                  className={cn(
                    'inline-block rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed',
                    mine
                      ? 'bg-gradient-to-br from-spirit-600/80 to-haze-500/60 text-white'
                      : 'bg-night-700/70 text-slate-200',
                    message.deletedAt && 'italic opacity-60',
                  )}
                >
                  {message.deletedAt ? t.messages.deleted : message.content}
                  {message.attachments.map((attachment) =>
                    IMAGE_MIME_TYPES.includes(attachment.mimeType as never) ? (
                      <a key={attachment.id} href={attachment.url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                        <img
                          src={attachment.url}
                          alt={attachment.fileName}
                          className="max-h-56 rounded-xl border border-spirit-400/15 object-cover"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <a
                        key={attachment.id}
                        href={attachment.url}
                        className="mt-2 flex items-center gap-2 rounded-lg bg-night-900/40 px-2.5 py-1.5 text-xs text-haze-400 hover:underline"
                      >
                        <Paperclip className="h-3.5 w-3.5" aria-hidden />
                        {attachment.fileName} ({formatBytes(attachment.size)})
                      </a>
                    ),
                  )}
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-600" style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  {formatTime(message.createdAt, locale)}
                  {message.editedAt && <span>({t.messages.edited})</span>}
                  {mine && lastMineRead?.id === message.id && (
                    <span className="flex items-center gap-0.5 text-haze-400">
                      <CheckCheck className="h-3 w-3" aria-hidden /> {t.messages.read}
                    </span>
                  )}
                </p>
                {message.reactions.length > 0 && (
                  <div className={cn('mt-1 flex flex-wrap gap-1', mine && 'justify-end')}>
                    {message.reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        onClick={() => void react(message, reaction.emoji)}
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-xs transition-colors',
                          reaction.mine
                            ? 'border-spirit-400/50 bg-spirit-500/20'
                            : 'border-spirit-400/15 bg-night-800/60 hover:border-spirit-400/40',
                        )}
                      >
                        {reaction.emoji} {reaction.count}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions du message */}
              {!message.deletedAt && (
                <div className="self-center opacity-0 transition-opacity group-hover:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t.nav.menu}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={mine ? 'end' : 'start'}>
                      <div className="flex gap-1 px-2 py-1">
                        {QUICK_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            className="rounded-lg p-1 text-base transition-transform hover:scale-125"
                            onClick={() => void react(message, emoji)}
                            aria-label={`${t.messages.react} ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setReplyTo(message)}>
                        <CornerUpLeft className="h-4 w-4" /> {t.messages.reply}
                      </DropdownMenuItem>
                      {mine && (
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(message);
                            setDraft(message.content);
                          }}
                        >
                          <Pencil className="h-4 w-4" /> {t.common.edit}
                        </DropdownMenuItem>
                      )}
                      {mine ? (
                        <DropdownMenuItem className="text-danger" onSelect={() => setDeleteTarget(message)}>
                          <Trash2 className="h-4 w-4" /> {t.common.delete}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem className="text-warning" onSelect={() => setReportTarget(message)}>
                          <Flag className="h-4 w-4" /> {t.messages.report}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Indicateur « écrit… » */}
      <div className="h-5 px-4 text-xs text-spirit-300" aria-live="polite">
        {typingLabel && (
          <span className="inline-flex items-center gap-1">
            <SmilePlus className="h-3 w-3 animate-pulse" aria-hidden />
            {typingLabel} {t.messages.typing}
          </span>
        )}
      </div>

      {/* Zone de saisie */}
      <div className="border-t border-spirit-400/10 p-3">
        {(replyTo || editing) && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-night-800/70 px-3 py-1.5 text-xs text-slate-400">
            <span className="truncate">
              {editing ? t.messages.editMessage : `${t.messages.reply} → ${replyTo?.author.displayName}: ${replyTo?.content.slice(0, 60)}`}
            </span>
            <button
              aria-label={t.common.cancel}
              onClick={() => {
                setReplyTo(null);
                setEditing(null);
                setDraft('');
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <span key={attachment.token} className="flex items-center gap-1.5 rounded-lg bg-night-800/70 px-2.5 py-1 text-xs text-slate-300">
                <Paperclip className="h-3 w-3" aria-hidden /> {attachment.fileName}
                <button aria-label={t.common.delete} onClick={() => setAttachments((prev) => prev.filter((a) => a.token !== attachment.token))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,application/zip"
            onChange={(e) => void pickFiles(e.target.files)}
          />
          <Button variant="ghost" size="icon" aria-label={t.messages.attach} onClick={() => fileInputRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={t.messages.placeholder}
            aria-label={t.messages.placeholder}
            className="min-h-11 flex-1"
          />
          <Button aria-label={t.common.send} loading={sending} onClick={() => void send()}>
            {editing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Dialogues */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t.common.delete}
        description={t.messages.deleteConfirm}
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await api(`/messages/${deleteTarget.id}`, { method: 'DELETE' });
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t.common.error);
          }
          setDeleteTarget(null);
        }}
      />

      <Dialog open={!!reportTarget} onOpenChange={(open) => !open && setReportTarget(null)}>
        <DialogContent title={t.messages.report}>
          <Input
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder={t.messages.reportReason}
            aria-label={t.messages.reportReason}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReportTarget(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="danger"
              disabled={reportReason.trim().length < 3}
              onClick={async () => {
                if (!reportTarget) return;
                try {
                  await api(`/messages/${reportTarget.id}/report`, {
                    method: 'POST',
                    body: { reason: reportReason.trim(), details: reportTarget.content.slice(0, 500) },
                  });
                  toast.success(t.messages.reported);
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : t.common.error);
                }
                setReportTarget(null);
                setReportReason('');
              }}
            >
              {t.messages.report}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent title={t.messages.searchConversation}>
          <div className="flex gap-2">
            <Input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
              placeholder={t.messages.searchConversation}
              aria-label={t.messages.searchConversation}
            />
            <Button onClick={() => void runSearch()}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {searchResults.map((message) => (
              <div key={message.id} className="rounded-lg bg-night-800/60 px-3 py-2 text-sm">
                <p className="text-xs text-slate-500">
                  {message.author.displayName} · {formatTime(message.createdAt, locale)}
                </p>
                <p className="text-slate-300">{message.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
