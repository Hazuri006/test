'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { timeAgo } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { NotificationDTO } from '@yurei/shared';

const TYPE_ICONS: Record<string, string> = {
  WELCOME: '👋',
  FRIEND_REQUEST: '🤝',
  FRIEND_ACCEPTED: '✅',
  NEW_MESSAGE: '💬',
  TICKET_REPLY: '🎫',
  TICKET_CLAIMED: '🛠️',
  TICKET_STATUS: '📋',
  ANNOUNCEMENT: '📢',
  MODERATION: '⚠️',
  SYSTEM: '🔔',
};

export default function NotificationsPage() {
  const t = useT();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data: notifications, isLoading } = useQuery<NotificationDTO[]>({
    queryKey: ['notifications', 'page', unreadOnly],
    queryFn: () => api(`/notifications${unreadOnly ? '?unread=true' : ''}`),
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">{t.notifications.title}</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <Switch checked={unreadOnly} onCheckedChange={setUnreadOnly} />
            {t.notifications.unreadOnly}
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void api('/notifications/read-all', { method: 'POST' }).then(refresh)}
          >
            <CheckCheck className="h-4 w-4" /> {t.notifications.markAllRead}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : (notifications ?? []).length === 0 ? (
        <EmptyState icon={Bell} title={t.notifications.empty} />
      ) : (
        <div className="space-y-2">
          {(notifications ?? []).map((notification) => (
            <Card
              key={notification.id}
              className={cn(!notification.readAt && 'border-spirit-400/30 bg-spirit-500/5')}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <span className="text-xl" aria-hidden>
                  {TYPE_ICONS[notification.type] ?? '🔔'}
                </span>
                <div className="min-w-0 flex-1">
                  {notification.link ? (
                    <Link href={notification.link} className="font-medium text-slate-100 hover:text-white">
                      {notification.title}
                    </Link>
                  ) : (
                    <p className="font-medium text-slate-100">{notification.title}</p>
                  )}
                  {notification.body && <p className="text-sm text-slate-400">{notification.body}</p>}
                  <p className="mt-1 text-xs text-slate-600">{timeAgo(notification.createdAt, locale)}</p>
                </div>
                {!notification.readAt && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.notifications.markRead}
                    onClick={() => void api(`/notifications/${notification.id}/read`, { method: 'POST' }).then(refresh)}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t.common.delete}
                  className="text-danger"
                  onClick={() => void api(`/notifications/${notification.id}`, { method: 'DELETE' }).then(refresh)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
