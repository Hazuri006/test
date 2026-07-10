'use client';

import Link from 'next/link';
import { useT, useI18n } from '@/lib/i18n';
import { timeAgo } from '@/lib/format';
import { Badge, priorityBadgeVariant, statusBadgeVariant } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { TicketListItem } from '@yurei/shared';

export function TicketRow({ ticket }: { ticket: TicketListItem }) {
  const t = useT();
  const { locale } = useI18n();
  return (
    <Link href={`/tickets/${ticket.id}`} className="block">
      <Card className="glass-hover">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <span className="font-mono text-xs text-slate-500">{ticket.code}</span>
          <span className="min-w-0 flex-1 truncate font-medium text-slate-100">{ticket.title}</span>
          <Badge variant="gray">{t.tickets.categories[ticket.category]}</Badge>
          <Badge variant={priorityBadgeVariant[ticket.priority]}>{t.tickets.priorities[ticket.priority]}</Badge>
          <Badge variant={statusBadgeVariant[ticket.status]}>{t.tickets.statuses[ticket.status]}</Badge>
          <span className="text-xs text-slate-600">{timeAgo(ticket.lastMessageAt ?? ticket.updatedAt, locale)}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
