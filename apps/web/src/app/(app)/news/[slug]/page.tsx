'use client';

/* eslint-disable @next/next/no-img-element */
import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, PenSquare } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { useSession } from '@/hooks/use-session';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PERMISSIONS } from '@yurei/shared';
import type { AnnouncementDTO } from '@yurei/shared';

export default function NewsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();

  const { data: announcement, isLoading, error } = useQuery<AnnouncementDTO>({
    queryKey: ['news', 'detail', slug],
    queryFn: () => api(`/news/${slug}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-64 w-full rounded-xl2" />
      </div>
    );
  }

  if (error || !announcement) {
    return (
      <Card className="mx-auto max-w-3xl">
        <CardContent className="py-10 text-center text-slate-400">
          {error instanceof ApiError ? error.message : t.common.error}
        </CardContent>
      </Card>
    );
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/news" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {t.common.back}
        </Link>
        {can(PERMISSIONS.ANNOUNCEMENTS_CREATE) && (
          <Link href={`/staff/news?edit=${announcement.id}`}>
            <Button variant="ghost" size="sm">
              <PenSquare className="h-4 w-4" /> {t.common.edit}
            </Button>
          </Link>
        )}
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {announcement.pinned && <Badge variant="pink">📌 {t.news.pinned}</Badge>}
          {announcement.status === 'DRAFT' && <Badge variant="yellow">{t.news.draft}</Badge>}
          <Badge variant="blue">{announcement.category}</Badge>
          {announcement.tags.map((tag) => (
            <Badge key={tag} variant="gray">
              #{tag}
            </Badge>
          ))}
        </div>
        <h1 className="text-3xl font-bold text-white">{announcement.title}</h1>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <UserAvatar src={announcement.author.avatarUrl} name={announcement.author.displayName} size={26} />
          {t.news.by} {announcement.author.displayName} ·{' '}
          {formatDate(announcement.publishedAt ?? announcement.createdAt, locale)}
        </div>
      </header>

      {announcement.imageUrl && (
        <img src={announcement.imageUrl} alt="" className="w-full rounded-xl2 border border-spirit-400/10" />
      )}

      <Card>
        <CardContent className="p-6">
          {/* Contenu assaini côté serveur (sanitize-html, liste blanche stricte) */}
          <div
            className="rich-content text-slate-300"
            dangerouslySetInnerHTML={{ __html: announcement.content ?? '' }}
          />
        </CardContent>
      </Card>
    </article>
  );
}
