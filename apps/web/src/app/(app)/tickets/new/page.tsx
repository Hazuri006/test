'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Paperclip, X } from 'lucide-react';
import { createTicketSchema, TICKET_CATEGORIES, TICKET_PRIORITIES } from '@yurei/shared';
import { api, ApiError, uploadFile } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { z } from 'zod';
import type { TicketDetail, UploadResult } from '@yurei/shared';

type TicketForm = z.infer<typeof createTicketSchema>;

export default function NewTicketPage() {
  const t = useT();
  const router = useRouter();
  const [attachments, setAttachments] = useState<UploadResult[]>([]);

  const form = useForm<TicketForm>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { title: '', description: '', category: 'TECH_SUPPORT', priority: 'MEDIUM', attachments: [] },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      const ticket = await api<TicketDetail>('/tickets', {
        method: 'POST',
        body: { ...values, attachments: attachments.map((a) => a.token) },
      });
      toast.success(t.tickets.created);
      router.push(`/tickets/${ticket.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    }
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-white">{t.tickets.newTicket}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t.tickets.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="title">{t.tickets.ticketTitle}</Label>
              <Input id="title" placeholder={t.tickets.titlePlaceholder} maxLength={120} {...form.register('title')} />
              {form.formState.errors.title && (
                <p className="mt-1 text-xs text-danger">{form.formState.errors.title.message}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t.tickets.category}</Label>
                <Select
                  value={form.watch('category')}
                  onValueChange={(v) => form.setValue('category', v as TicketForm['category'])}
                >
                  <SelectTrigger aria-label={t.tickets.category}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {t.tickets.categories[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t.tickets.priority}</Label>
                <Select
                  value={form.watch('priority')}
                  onValueChange={(v) => form.setValue('priority', v as TicketForm['priority'])}
                >
                  <SelectTrigger aria-label={t.tickets.priority}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {t.tickets.priorities[priority]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">{t.tickets.description}</Label>
              <Textarea
                id="description"
                rows={6}
                maxLength={5000}
                placeholder={t.tickets.descriptionPlaceholder}
                {...form.register('description')}
              />
              {form.formState.errors.description && (
                <p className="mt-1 text-xs text-danger">{form.formState.errors.description.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="ticket-files">
                {t.tickets.attachments} ({t.common.optional})
              </Label>
              <input
                id="ticket-files"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,application/zip"
                className="block w-full text-sm text-slate-400 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-spirit-600/30 file:px-3 file:py-1.5 file:text-sm file:text-spirit-200"
                onChange={async (e) => {
                  for (const file of Array.from(e.target.files ?? []).slice(0, 5 - attachments.length)) {
                    try {
                      setAttachments((prev) => [...prev, ...[]]);
                      const result = await uploadFile(file);
                      setAttachments((prev) => [...prev, result]);
                    } catch (err) {
                      toast.error(err instanceof ApiError ? err.message : t.common.error);
                    }
                  }
                  e.target.value = '';
                }}
              />
              {attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <span key={attachment.token} className="flex items-center gap-1.5 rounded-lg bg-night-800/70 px-2.5 py-1 text-xs text-slate-300">
                      <Paperclip className="h-3 w-3" aria-hidden /> {attachment.fileName}
                      <button
                        type="button"
                        aria-label={t.common.delete}
                        onClick={() => setAttachments((prev) => prev.filter((a) => a.token !== attachment.token))}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                {t.common.cancel}
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {t.tickets.submit}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
