'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Ticket as TicketIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { TicketRow } from '@/components/tickets/ticket-row';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import type { TicketListItem } from '@yurei/shared';

export default function TicketsPage() {
  const t = useT();
  const { data: tickets, isLoading } = useQuery<TicketListItem[]>({
    queryKey: ['tickets', 'own'],
    queryFn: () => api('/tickets'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t.tickets.title}</h1>
        <Link href="/tickets/new">
          <Button>
            <Plus className="h-4 w-4" /> {t.tickets.newTicket}
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : (tickets ?? []).length === 0 ? (
        <EmptyState icon={TicketIcon} title={t.tickets.noTickets}>
          <Link href="/tickets/new" className="text-spirit-400 hover:underline">
            {t.tickets.newTicket}
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {(tickets ?? []).map((ticket) => (
            <TicketRow key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}
    </div>
  );
}
