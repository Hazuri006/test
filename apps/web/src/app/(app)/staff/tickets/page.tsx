'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Inbox, Ticket as TicketIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { TicketRow } from '@/components/tickets/ticket-row';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '@yurei/shared';
import type { Paginated, TicketListItem } from '@yurei/shared';

interface TicketStats {
  byStatus: Record<string, number>;
  unassigned: number;
  avgFirstResponseMinutes: number | null;
}

const ALL = '__all__';

export default function StaffTicketsPage() {
  const t = useT();
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [pages, setPages] = useState<TicketListItem[][]>([]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== ALL) params.set('status', status);
    if (category !== ALL) params.set('category', category);
    if (priority !== ALL) params.set('priority', priority);
    if (unassignedOnly) params.set('unassigned', 'true');
    if (search.trim()) params.set('q', search.trim());
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  }, [status, category, priority, unassignedOnly, search, cursor]);

  const { data, isLoading } = useQuery<Paginated<TicketListItem>>({
    queryKey: ['tickets', 'all', queryString],
    queryFn: async () => {
      const page = await api<Paginated<TicketListItem>>(`/tickets/all?${queryString}`);
      setPages((prev) => (cursor ? [...prev, page.items] : [page.items]));
      return page;
    },
  });

  const { data: stats } = useQuery<TicketStats>({
    queryKey: ['tickets', 'stats'],
    queryFn: () => api('/tickets/stats'),
    refetchInterval: 60_000,
  });

  const tickets = pages.flat();
  const resetPagination = (): void => {
    setCursor(undefined);
    setPages([]);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">{t.tickets.staffTitle}</h1>

      {/* Statistiques */}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Inbox className="h-5 w-5 text-bloom-400" aria-hidden />
              <span>
                <span className="block text-xl font-bold text-white">{stats.unassigned}</span>
                <span className="text-xs text-slate-500">{t.tickets.unassigned}</span>
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Clock className="h-5 w-5 text-haze-400" aria-hidden />
              <span>
                <span className="block text-xl font-bold text-white">
                  {stats.avgFirstResponseMinutes !== null ? `${stats.avgFirstResponseMinutes} min` : '—'}
                </span>
                <span className="text-xs text-slate-500">{t.tickets.avgFirstResponse}</span>
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <TicketIcon className="h-5 w-5 text-spirit-400" aria-hidden />
              <span>
                <span className="block text-xl font-bold text-white">
                  {Object.entries(stats.byStatus)
                    .filter(([s]) => !['CLOSED', 'ARCHIVED'].includes(s))
                    .reduce((acc, [, n]) => acc + n, 0)}
                </span>
                <span className="text-xs text-slate-500">{t.dashboard.openTickets}</span>
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPagination();
            }}
            placeholder={t.common.search}
            aria-label={t.common.search}
          />
          <Select value={status} onValueChange={(v) => { setStatus(v); resetPagination(); }}>
            <SelectTrigger aria-label={t.tickets.status}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t.tickets.allStatuses}</SelectItem>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{t.tickets.statuses[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => { setCategory(v); resetPagination(); }}>
            <SelectTrigger aria-label={t.tickets.category}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t.tickets.allCategories}</SelectItem>
              {TICKET_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{t.tickets.categories[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={(v) => { setPriority(v); resetPagination(); }}>
            <SelectTrigger aria-label={t.tickets.priority}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t.tickets.allPriorities}</SelectItem>
              {TICKET_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{t.tickets.priorities[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <Switch checked={unassignedOnly} onCheckedChange={(v) => { setUnassignedOnly(v); resetPagination(); }} />
            {t.tickets.onlyUnassigned}
          </label>
        </CardContent>
      </Card>

      {/* Liste */}
      {isLoading && tickets.length === 0 ? (
        <ListSkeleton rows={6} />
      ) : tickets.length === 0 ? (
        <EmptyState icon={TicketIcon} title={t.common.empty} />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} />
          ))}
          {data?.nextCursor && (
            <div className="text-center">
              <Button variant="ghost" onClick={() => setCursor(data.nextCursor ?? undefined)}>
                {t.messages.loadMore}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
