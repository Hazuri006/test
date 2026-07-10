'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Newspaper, PenSquare } from 'lucide-react';
import { api } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { timeAgo } from '@/lib/format';
import { useSession } from '@/hooks/use-session';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { CardSkeleton } from '@/components/ui/skeleton';
import { PERMISSIONS } from '@yurei/shared';
import type { AnnouncementDTO } from '@yurei/shared';

export default function NewsPage() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.ANNOUNCEMENTS_CREATE);

  const { data: announcements, isLoading } = useQuery<AnnouncementDTO[]>({
    queryKey: ['news', canEdit],
    queryFn: () => api(`/news${canEdit ? '?drafts=true' : ''}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t.news.title}</h1>
        {canEdit && (
          <Link href="/staff/news">
            <Button variant="secondary">
              <PenSquare className="h-4 w-4" /> {t.news.editor}
            </Button>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : (announcements ?? []).length === 0 ? (
        <EmptyState icon={Newspaper} title={t.news.noNews} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(announcements ?? []).map((announcement) => (
            <Link key={announcement.id} href={`/news/${announcement.slug}`} className="block">
              <Card className="glass-hover h-full overflow-hidden">
                {announcement.imageUrl && (
                  <img
                    src={announcement.imageUrl}
                    alt=""
                    className="h-36 w-full object-cover"
                    loading="lazy"
                  />
                )}
                <CardContent className="space-y-2 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {announcement.pinned && <Badge variant="pink">📌 {t.news.pinned}</Badge>}
                    {announcement.status === 'DRAFT' && (
                      <Badge variant="yellow">
                        {announcement.scheduledFor ? t.news.scheduled : t.news.draft}
                      </Badge>
                    )}
                    <Badge variant="blue">{announcement.category}</Badge>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-100">{announcement.title}</h2>
                  <p className="line-clamp-2 text-sm text-slate-400">{announcement.summary}</p>
                  <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
                    <UserAvatar src={announcement.author.avatarUrl} name={announcement.author.displayName} size={22} />
                    {t.news.by} {announcement.author.displayName} · {timeAgo(announcement.publishedAt ?? announcement.createdAt, locale)}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
