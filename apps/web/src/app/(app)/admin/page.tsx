'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, FileWarning, MessageSquare, Ticket, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardSkeleton } from '@/components/ui/skeleton';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import type { TicketStatus } from '@yurei/shared';

interface Overview {
  users: number;
  newUsers24h: number;
  openTickets: number;
  openReports: number;
  messages24h: number;
  onlineNow: number;
}

interface Stats {
  usersPerDay: { date: string; count: number }[];
  messagesPerDay: { date: string; count: number }[];
  ticketsByStatus: Record<string, number>;
}

function BarChart({ data, color, label }: { data: { date: string; count: number }[]; color: string; label: string }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <div className="flex h-24 items-end gap-[3px]" role="img" aria-label={label}>
        {data.map((point) => (
          <div
            key={point.date}
            title={`${point.date}: ${point.count}`}
            className="min-w-1 flex-1 rounded-t"
            style={{
              height: `${Math.max(4, (point.count / max) * 100)}%`,
              backgroundColor: color,
              opacity: point.count === 0 ? 0.25 : 0.85,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const t = useT();
  const { data: overview } = useQuery<Overview>({
    queryKey: ['admin', 'overview'],
    queryFn: () => api('/admin/overview'),
    refetchInterval: 30_000,
  });
  const { data: stats } = useQuery<Stats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => api('/admin/stats'),
  });

  if (!overview) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  const cards = [
    { icon: Users, label: t.admin.overview.totalUsers, value: overview.users, color: 'text-spirit-300 bg-spirit-500/15' },
    { icon: UserPlus, label: t.admin.overview.newToday, value: overview.newUsers24h, color: 'text-success bg-success/15' },
    { icon: Ticket, label: t.admin.overview.openTickets, value: overview.openTickets, color: 'text-warning bg-warning/15' },
    { icon: FileWarning, label: t.admin.overview.openReports, value: overview.openReports, color: 'text-danger bg-danger/15' },
    { icon: MessageSquare, label: t.admin.overview.messages24h, value: overview.messages24h, color: 'text-haze-400 bg-haze-500/15' },
    { icon: Activity, label: t.admin.overview.onlineNow, value: overview.onlineNow, color: 'text-bloom-400 bg-bloom-500/15' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-2xl font-bold text-white">{card.value}</span>
                <span className="text-xs text-slate-400">{card.label}</span>
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <BarChart data={stats.usersPerDay} color="#a78bfa" label={`${t.admin.overview.totalUsers} / 30j`} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <BarChart data={stats.messagesPerDay} color="#38bdf8" label={`${t.nav.messages} / 30j`} />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t.nav.tickets}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {Object.entries(stats.ticketsByStatus).map(([status, count]) => (
                <Badge key={status} variant={statusBadgeVariant[status as TicketStatus] ?? 'gray'}>
                  {t.tickets.statuses[status as TicketStatus] ?? status} : {count}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
