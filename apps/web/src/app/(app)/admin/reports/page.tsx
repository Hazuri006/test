'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileWarning } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { REPORT_STATUSES } from '@yurei/shared';
import type { ReportDTO, ReportStatus } from '@yurei/shared';

const ALL = '__all__';
const statusVariant: Record<ReportStatus, 'blue' | 'yellow' | 'green' | 'gray'> = {
  OPEN: 'blue',
  REVIEWING: 'yellow',
  RESOLVED: 'green',
  DISMISSED: 'gray',
};

export default function AdminReportsPage() {
  const t = useT();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState(ALL);

  const { data: reports, isLoading } = useQuery<ReportDTO[]>({
    queryKey: ['admin', 'reports', statusFilter],
    queryFn: () => api(`/admin/reports${statusFilter !== ALL ? `?status=${statusFilter}` : ''}`),
  });

  const resolve = async (report: ReportDTO, status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED'): Promise<void> => {
    try {
      await api(`/admin/reports/${report.id}/resolve`, { method: 'POST', body: { status } });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    }
  };

  return (
    <div className="space-y-4">
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="max-w-52" aria-label={t.tickets.status}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t.tickets.allStatuses}</SelectItem>
          {REPORT_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>{t.admin.reports.statuses[status]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : (reports ?? []).length === 0 ? (
        <EmptyState icon={FileWarning} title={t.common.empty} />
      ) : (
        <div className="space-y-2">
          {(reports ?? []).map((report) => (
            <Card key={report.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant[report.status]}>{t.admin.reports.statuses[report.status]}</Badge>
                  <span className="font-medium text-slate-100">{report.reason}</span>
                  <span className="ml-auto text-xs text-slate-500">{formatDateTime(report.createdAt, locale)}</span>
                </div>
                {report.details && <p className="text-sm text-slate-400">{report.details}</p>}
                <p className="text-xs text-slate-500">
                  {t.admin.reports.reporter}{' '}
                  <Link href={`/users/${report.reporter.id}`} className="text-spirit-400 hover:underline">
                    {report.reporter.displayName}
                  </Link>
                  {report.targetUser && (
                    <>
                      {' '}· {t.admin.reports.target}{' '}
                      <Link href={`/users/${report.targetUser.id}`} className="text-bloom-400 hover:underline">
                        {report.targetUser.displayName}
                      </Link>
                    </>
                  )}
                </p>
                {['OPEN', 'REVIEWING'].includes(report.status) && (
                  <div className="flex gap-2">
                    {report.status === 'OPEN' && (
                      <Button size="sm" variant="secondary" onClick={() => void resolve(report, 'REVIEWING')}>
                        {t.admin.reports.review}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => void resolve(report, 'RESOLVED')}>
                      {t.admin.reports.resolve}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void resolve(report, 'DISMISSED')}>
                      {t.admin.reports.dismiss}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
