'use client';

/* eslint-disable @next/next/no-img-element */
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Archive,
  Download,
  Hand,
  Lock,
  NotebookPen,
  Paperclip,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { api, ApiError, uploadFile } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/hooks/use-session';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge, priorityBadgeVariant, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatBytes, API_URL } from '@/lib/utils';
import { IMAGE_MIME_TYPES, PERMISSIONS, TICKET_CATEGORIES, TICKET_PRIORITIES } from '@yurei/shared';
import type { TicketDetail, UploadResult } from '@yurei/shared';

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const { locale } = useI18n();
  const { user, can } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<UploadResult[]>([]);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState<null | 'close' | 'archive' | 'delete'>(null);

  const { data: ticket, isLoading } = useQuery<TicketDetail>({
    queryKey: ['tickets', id],
    queryFn: () => api(`/tickets/${id}`),
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['tickets'] });
  };

  const act = async (fn: () => Promise<unknown>, success?: string): Promise<void> => {
    try {
      await fn();
      if (success) toast.success(success);
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    }
  };

  if (isLoading || !ticket) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64 w-full rounded-xl2" />
      </div>
    );
  }

  const isStaff = can(PERMISSIONS.TICKETS_VIEW_ALL);
  const isCreator = ticket.creator.id === user?.id;
  const closed = ['CLOSED', 'ARCHIVED'].includes(ticket.status);

  const sendReply = async (): Promise<void> => {
    if ((!reply.trim() && attachments.length === 0) || sending) return;
    setSending(true);
    try {
      await api(`/tickets/${id}/messages`, {
        method: 'POST',
        body: { content: reply.trim(), attachments: attachments.map((a) => a.token) },
      });
      setReply('');
      setAttachments([]);
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-slate-500">{ticket.code}</p>
          <h1 className="text-2xl font-bold text-white">{ticket.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant[ticket.status]}>{t.tickets.statuses[ticket.status]}</Badge>
            <Badge variant={priorityBadgeVariant[ticket.priority]}>{t.tickets.priorities[ticket.priority]}</Badge>
            <Badge variant="gray">{t.tickets.categories[ticket.category]}</Badge>
            <span className="text-xs text-slate-500">
              {t.tickets.createdBy} {ticket.creator.displayName} · {formatDateTime(ticket.createdAt, locale)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a href={`${API_URL}/api/tickets/${id}/transcript`} download>
            <Button variant="ghost" size="sm">
              <Download className="h-4 w-4" /> {t.tickets.transcript}
            </Button>
          </a>
          {isStaff && !ticket.assignee && !closed && (
            <Button size="sm" onClick={() => void act(() => api(`/tickets/${id}/claim`, { method: 'POST' }), t.tickets.claimed)}>
              <Hand className="h-4 w-4" /> {t.tickets.claim}
            </Button>
          )}
          {isStaff && can(PERMISSIONS.TICKETS_CLOSE) && !closed && (
            <Button size="sm" variant="secondary" onClick={() => void act(() => api(`/tickets/${id}/status`, { method: 'POST', body: { status: 'RESOLVED' } }))}>
              {t.tickets.resolve}
            </Button>
          )}
          {(isCreator || can(PERMISSIONS.TICKETS_CLOSE)) && !closed && (
            <Button size="sm" variant="outline" onClick={() => setConfirm('close')}>
              <Lock className="h-4 w-4" /> {t.tickets.close}
            </Button>
          )}
          {isCreator && ['CLOSED', 'RESOLVED'].includes(ticket.status) && (
            <Button size="sm" variant="outline" onClick={() => void act(() => api(`/tickets/${id}/status`, { method: 'POST', body: { status: 'WAITING_STAFF' } }))}>
              <RotateCcw className="h-4 w-4" /> {t.tickets.reopen}
            </Button>
          )}
          {can(PERMISSIONS.TICKETS_DELETE) && (
            <>
              {ticket.status !== 'ARCHIVED' && (
                <Button size="sm" variant="ghost" onClick={() => setConfirm('archive')}>
                  <Archive className="h-4 w-4" /> {t.tickets.archive}
                </Button>
              )}
              <Button size="sm" variant="danger" onClick={() => setConfirm('delete')}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Fil de discussion */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 p-5">
              {ticket.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.system && 'justify-center',
                  )}
                >
                  {message.system ? (
                    <p className="rounded-full bg-night-800/70 px-4 py-1 text-xs text-slate-500">
                      ⚙ {message.content} · {formatDateTime(message.createdAt, locale)}
                    </p>
                  ) : (
                    <>
                      <UserAvatar src={message.author.avatarUrl} name={message.author.displayName} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-2">
                          <span className="font-medium text-slate-100">{message.author.displayName}</span>
                          <span className="text-xs text-slate-600">{formatDateTime(message.createdAt, locale)}</span>
                        </p>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{message.content}</p>
                        {message.attachments.map((attachment) =>
                          IMAGE_MIME_TYPES.includes(attachment.mimeType as never) ? (
                            <a key={attachment.id} href={attachment.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
                              <img src={attachment.url} alt={attachment.fileName} className="max-h-48 rounded-xl border border-spirit-400/15" loading="lazy" />
                            </a>
                          ) : (
                            <a key={attachment.id} href={attachment.url} className="mt-2 flex w-fit items-center gap-2 rounded-lg bg-night-800/60 px-2.5 py-1.5 text-xs text-haze-400 hover:underline">
                              <Paperclip className="h-3.5 w-3.5" aria-hidden /> {attachment.fileName} ({formatBytes(attachment.size)})
                            </a>
                          ),
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Réponse */}
          {!closed || isStaff ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder={t.tickets.replyPlaceholder}
                  aria-label={t.tickets.replyPlaceholder}
                />
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((attachment) => (
                      <span key={attachment.token} className="rounded-lg bg-night-800/70 px-2.5 py-1 text-xs text-slate-300">
                        📎 {attachment.fileName}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <label className="cursor-pointer text-sm text-slate-500 hover:text-slate-300">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,application/zip"
                      onChange={async (e) => {
                        for (const file of Array.from(e.target.files ?? []).slice(0, 5 - attachments.length)) {
                          try {
                            const result = await uploadFile(file);
                            setAttachments((prev) => [...prev, result]);
                          } catch (err) {
                            toast.error(err instanceof ApiError ? err.message : t.common.error);
                          }
                        }
                        e.target.value = '';
                      }}
                    />
                    <Paperclip className="mr-1 inline h-4 w-4" aria-hidden /> {t.messages.attach}
                  </label>
                  <Button loading={sending} onClick={() => void sendReply()}>
                    <Send className="h-4 w-4" /> {t.common.send}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Panneau latéral */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t.tickets.status}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-slate-500">{t.tickets.assignee}</span>
                {ticket.assignee ? (
                  <span className="flex items-center gap-2 text-slate-200">
                    <UserAvatar src={ticket.assignee.avatarUrl} name={ticket.assignee.displayName} size={22} />
                    {ticket.assignee.displayName}
                  </span>
                ) : (
                  <span className="text-slate-500">{t.tickets.unassigned}</span>
                )}
              </p>
              {isStaff && (
                <>
                  <div>
                    <p className="mb-1 text-slate-500">{t.tickets.priority}</p>
                    <Select
                      value={ticket.priority}
                      onValueChange={(v) => void act(() => api(`/tickets/${id}`, { method: 'PATCH', body: { priority: v } }))}
                    >
                      <SelectTrigger aria-label={t.tickets.priority}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TICKET_PRIORITIES.map((priority) => (
                          <SelectItem key={priority} value={priority}>{t.tickets.priorities[priority]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-1 text-slate-500">{t.tickets.category}</p>
                    <Select
                      value={ticket.category}
                      onValueChange={(v) => void act(() => api(`/tickets/${id}`, { method: 'PATCH', body: { category: v } }))}
                    >
                      <SelectTrigger aria-label={t.tickets.category}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TICKET_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>{t.tickets.categories[category]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Notes internes (staff) */}
          {isStaff && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-warning" aria-hidden /> {t.tickets.internalNotes}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(ticket.internalNotes ?? []).map((internalNote) => (
                  <div key={internalNote.id} className="rounded-lg border border-warning/15 bg-warning/5 px-3 py-2 text-sm">
                    <p className="text-xs text-slate-500">
                      {internalNote.author.displayName} · {formatDateTime(internalNote.createdAt, locale)}
                    </p>
                    <p className="text-slate-300">{internalNote.content}</p>
                  </div>
                ))}
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={t.tickets.addNote}
                  aria-label={t.tickets.addNote}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={note.trim().length === 0}
                  onClick={() =>
                    void act(async () => {
                      await api(`/tickets/${id}/notes`, { method: 'POST', body: { content: note.trim() } });
                      setNote('');
                    })
                  }
                >
                  {t.tickets.addNote}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'close'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t.tickets.close}
        description={t.tickets.closeConfirm}
        onConfirm={async () => {
          await act(() => api(`/tickets/${id}/status`, { method: 'POST', body: { status: 'CLOSED' } }));
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t.tickets.archive}
        description={t.tickets.archiveConfirm}
        onConfirm={async () => {
          await act(() => api(`/tickets/${id}/status`, { method: 'POST', body: { status: 'ARCHIVED' } }));
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t.common.delete}
        description={t.tickets.deleteConfirm}
        destructive
        onConfirm={async () => {
          await act(() => api(`/tickets/${id}`, { method: 'DELETE' }));
          setConfirm(null);
          router.push(isStaff ? '/staff/tickets' : '/tickets');
        }}
      />
    </div>
  );
}
