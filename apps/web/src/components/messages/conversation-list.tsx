'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { timeAgo } from '@/lib/format';
import { useSocket } from '@/hooks/use-socket';
import { UserAvatar } from '@/components/ui/avatar';
import { ListSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import type { ConversationDTO } from '@yurei/shared';

export function ConversationList({ activeId }: { activeId?: string }) {
  const t = useT();
  const { locale } = useI18n();
  const { presenceOf } = useSocket();

  const { data: conversations, isLoading } = useQuery<ConversationDTO[]>({
    queryKey: ['conversations'],
    queryFn: () => api('/conversations'),
  });

  if (isLoading) return <ListSkeleton rows={5} />;

  if ((conversations ?? []).length === 0) {
    return <EmptyState icon={MessageSquare} title={t.messages.noConversations} />;
  }

  return (
    <nav aria-label={t.messages.title} className="space-y-1">
      {(conversations ?? []).map((conversation) => (
        <Link
          key={conversation.id}
          href={`/messages/${conversation.id}`}
          aria-current={conversation.id === activeId ? 'page' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
            conversation.id === activeId
              ? 'bg-spirit-600/20 text-white'
              : 'hover:bg-night-700/50',
          )}
        >
          <UserAvatar
            src={conversation.other.avatarUrl}
            name={conversation.other.displayName}
            size={42}
            status={presenceOf(conversation.other.id)}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-slate-100">
                {conversation.other.displayName}
                {conversation.muted && ' 🔇'}
              </span>
              {conversation.lastMessageAt && (
                <span className="shrink-0 text-[11px] text-slate-500">
                  {timeAgo(conversation.lastMessageAt, locale)}
                </span>
              )}
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-slate-500">
                {conversation.lastMessage
                  ? conversation.lastMessage.hasAttachment && !conversation.lastMessage.content
                    ? `📎 ${t.messages.attachment}`
                    : conversation.lastMessage.content
                  : '…'}
              </span>
              {conversation.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-bloom-500 px-1.5 text-[10px] font-bold text-white">
                  {conversation.unreadCount}
                </span>
              )}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
