'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  Bell,
  MessageSquare,
  Newspaper,
  Server,
  Ticket,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/hooks/use-session';
import { useT, useI18n } from '@/lib/i18n';
import { formatDateTime, formatUptime, timeAgo } from '@/lib/format';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardSkeleton, Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { DashboardData } from '@yurei/shared';

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  accent,
  index,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  value: number;
  accent: string;
  index: number;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Link href={href} className="block">
        <Card className="glass-hover">
          <CardContent className="flex items-center gap-4 p-5">
            <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', accent)}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block text-2xl font-bold text-white">{value}</span>
              <span className="block text-xs text-slate-400">{label}</span>
            </span>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

function PlayerChart({ data }: { data: DashboardData['serverHistory'] }) {
  const t = useT();
  if (data.length < 2) return null;
  const max = Math.max(...data.map((d) => d.playerCount), 1);
  const width = 600;
  const height = 120;
  const points = data
    .map((d, i) => `${(i / (data.length - 1)) * width},${height - (d.playerCount / max) * (height - 10)}`)
    .join(' ');

  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">{t.dashboard.playerHistory}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full" role="img" aria-label={t.dashboard.playerHistory}>
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(139 92 246 / 0.45)" />
            <stop offset="100%" stopColor="rgb(139 92 246 / 0)" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#chartFill)" />
        <polyline points={points} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function DashboardPage() {
  const t = useT();
  const { locale } = useI18n();
  const { user } = useSession();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api('/dashboard'),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const server = data.serverStatus;

  const stats = [
    { href: '/friends', icon: Users, label: t.dashboard.friends, value: data.friendCount, accent: 'bg-spirit-500/15 text-spirit-300' },
    { href: '/friends?tab=requests', icon: UserPlus, label: t.dashboard.requests, value: data.pendingFriendRequests, accent: 'bg-bloom-500/15 text-bloom-400' },
    { href: '/messages', icon: MessageSquare, label: t.dashboard.unreadMessages, value: data.unreadMessages, accent: 'bg-haze-500/15 text-haze-400' },
    { href: '/tickets', icon: Ticket, label: t.dashboard.openTickets, value: data.openTickets, accent: 'bg-warning/15 text-warning' },
    { href: '/notifications', icon: Bell, label: t.notifications.title, value: data.unreadNotifications, accent: 'bg-success/15 text-success' },
    { href: '/dashboard', icon: Activity, label: t.dashboard.onlinePlayers, value: data.onlineCount, accent: 'bg-spirit-500/15 text-spirit-300' },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête de bienvenue */}
      <div className="flex flex-wrap items-center gap-4">
        <UserAvatar src={user?.avatarUrl} name={user?.displayName ?? '?'} size={56} status="ONLINE" />
        <div>
          <h1 className="text-2xl font-bold text-white">
            {t.dashboard.welcome} <span className="glow-text">{user?.displayName}</span>
          </h1>
          <p className="text-sm text-slate-500">
            {t.dashboard.lastLogin} : {formatDateTime(user?.lastLoginAt, locale)}
          </p>
        </div>
      </div>

      {/* Cartes statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s, i) => (
          <StatCard key={s.label} index={i} {...s} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* État du serveur */}
        <Card className="glass-hover">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Server className="h-4 w-4 text-spirit-400" aria-hidden />
              {t.dashboard.serverStatus}
            </CardTitle>
            {server.online ? (
              <Badge variant="green">{t.common.online}</Badge>
            ) : (
              <Badge variant="red">{t.dashboard.serverOffline}</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {server.maintenance && <Badge variant="yellow">{t.dashboard.maintenance}</Badge>}
            <div className="flex items-end gap-2">
              <span className="text-4xl font-extrabold text-white">{server.playerCount}</span>
              <span className="pb-1 text-sm text-slate-400">/ {server.maxPlayers} {t.dashboard.playersOnline}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">{t.dashboard.map}</dt><dd className="text-slate-200">{server.mapName || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t.dashboard.version}</dt><dd className="text-slate-200">{server.version || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t.dashboard.uptime}</dt><dd className="text-slate-200">{formatUptime(server.uptimeSeconds, locale)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t.dashboard.latency}</dt><dd className="text-slate-200">{server.latencyMs} ms</dd></div>
            </dl>
            <PlayerChart data={data.serverHistory} />
            {server.demo && (
              <p className="rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                ⚠ {t.dashboard.demoData}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Annonces récentes */}
        <Card className="glass-hover">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-spirit-400" aria-hidden />
              {t.dashboard.recentNews}
            </CardTitle>
            <Link href="/news" className="text-xs text-spirit-400 hover:underline">
              {t.common.seeAll}
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentAnnouncements.length === 0 && (
              <p className="text-sm text-slate-500">{t.news.noNews}</p>
            )}
            {data.recentAnnouncements.map((a) => (
              <Link
                key={a.id}
                href={`/news/${a.slug}`}
                className="block rounded-xl border border-transparent p-3 transition-colors hover:border-spirit-400/20 hover:bg-night-700/40"
              >
                <div className="flex items-center gap-2">
                  {a.pinned && <Badge variant="pink">📌 {t.news.pinned}</Badge>}
                  <span className="font-medium text-slate-100">{a.title}</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{a.summary}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {t.news.by} {a.author.displayName} · {timeAgo(a.publishedAt, locale)}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Activité récente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-spirit-400" aria-hidden />
            {t.dashboard.recentActivity}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500">{t.common.empty}</p>
          ) : (
            <ul className="space-y-2">
              {data.recentActivity.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-4 text-sm">
                  {item.link ? (
                    <Link href={item.link} className="truncate text-slate-300 hover:text-white">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="truncate text-slate-300">{item.label}</span>
                  )}
                  <span className="shrink-0 text-xs text-slate-600">{timeAgo(item.at, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
