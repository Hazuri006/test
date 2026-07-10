'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PenSquare, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useT, useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { useSession } from '@/hooks/use-session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PERMISSIONS } from '@yurei/shared';
import type { AnnouncementDTO } from '@yurei/shared';

interface EditorState {
  id: string | null;
  title: string;
  summary: string;
  content: string;
  imageUrl: string;
  category: string;
  tags: string;
  pinned: boolean;
  publish: boolean;
  scheduledFor: string;
}

const emptyEditor: EditorState = {
  id: null,
  title: '',
  summary: '',
  content: '',
  imageUrl: '',
  category: 'news',
  tags: '',
  pinned: false,
  publish: false,
  scheduledFor: '',
};

function NewsEditorContent() {
  const t = useT();
  const { locale } = useI18n();
  const { can } = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementDTO | null>(null);

  const { data: announcements } = useQuery<AnnouncementDTO[]>({
    queryKey: ['news', 'editor'],
    queryFn: () => api('/news?drafts=true'),
  });

  // Pré-remplissage via ?edit=<id>
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || !announcements) return;
    const target = announcements.find((a) => a.id === editId);
    if (target) void loadForEdit(target);
  }, [searchParams, announcements]);

  const loadForEdit = async (announcement: AnnouncementDTO): Promise<void> => {
    const full = await api<AnnouncementDTO>(`/news/${announcement.slug}`);
    setEditor({
      id: full.id,
      title: full.title,
      summary: full.summary,
      content: full.content ?? '',
      imageUrl: full.imageUrl ?? '',
      category: full.category,
      tags: full.tags.join(', '),
      pinned: full.pinned,
      publish: full.status === 'PUBLISHED',
      scheduledFor: full.scheduledFor ? full.scheduledFor.slice(0, 16) : '',
    });
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const body = {
        title: editor.title,
        summary: editor.summary,
        content: editor.content,
        imageUrl: editor.imageUrl || undefined,
        category: editor.category,
        tags: editor.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        pinned: editor.pinned,
        status: editor.publish ? 'PUBLISHED' : 'DRAFT',
        scheduledFor: editor.scheduledFor ? new Date(editor.scheduledFor).toISOString() : null,
      };
      if (editor.id) {
        await api(`/news/${editor.id}`, { method: 'PATCH', body });
      } else {
        await api('/news', { method: 'POST', body });
      }
      toast.success(editor.publish ? t.news.published : t.common.saved);
      setEditor(emptyEditor);
      void queryClient.invalidateQueries({ queryKey: ['news'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.common.error);
    } finally {
      setSaving(false);
    }
  };

  const valid =
    editor.title.trim().length >= 4 &&
    editor.summary.trim().length >= 4 &&
    editor.content.trim().length >= 10;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">{t.news.editor}</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Formulaire */}
        <Card>
          <CardHeader>
            <CardTitle>{editor.id ? t.news.editAnnouncement : t.news.newAnnouncement}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="news-title">{t.news.fields.title}</Label>
              <Input id="news-title" value={editor.title} maxLength={150} onChange={(e) => setEditor({ ...editor, title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="news-summary">{t.news.fields.summary}</Label>
              <Input id="news-summary" value={editor.summary} maxLength={300} onChange={(e) => setEditor({ ...editor, summary: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="news-content">{t.news.fields.content}</Label>
              <Textarea id="news-content" rows={8} value={editor.content} onChange={(e) => setEditor({ ...editor, content: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="news-category">{t.news.fields.category}</Label>
                <Input id="news-category" value={editor.category} maxLength={50} onChange={(e) => setEditor({ ...editor, category: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="news-image">{t.news.fields.imageUrl}</Label>
                <Input id="news-image" type="url" value={editor.imageUrl} onChange={(e) => setEditor({ ...editor, imageUrl: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="news-tags">{t.news.fields.tags}</Label>
              <Input id="news-tags" value={editor.tags} onChange={(e) => setEditor({ ...editor, tags: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="news-schedule">
                {t.news.fields.scheduledFor} ({t.common.optional})
              </Label>
              <Input
                id="news-schedule"
                type="datetime-local"
                value={editor.scheduledFor}
                onChange={(e) => setEditor({ ...editor, scheduledFor: e.target.value, publish: false })}
              />
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <Switch checked={editor.pinned} onCheckedChange={(v) => setEditor({ ...editor, pinned: v })} />
                {t.news.fields.pinned}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <Switch
                  checked={editor.publish}
                  disabled={!!editor.scheduledFor}
                  onCheckedChange={(v) => setEditor({ ...editor, publish: v })}
                />
                {t.news.fields.publish}
              </label>
            </div>
            <div className="flex justify-end gap-2">
              {editor.id && (
                <Button variant="ghost" onClick={() => setEditor(emptyEditor)}>
                  {t.common.cancel}
                </Button>
              )}
              <Button loading={saving} disabled={!valid} onClick={() => void save()}>
                {t.common.save}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Liste des annonces */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">{t.news.title}</h2>
            <Button size="sm" variant="ghost" onClick={() => setEditor(emptyEditor)}>
              <Plus className="h-4 w-4" /> {t.news.newAnnouncement}
            </Button>
          </div>
          {(announcements ?? []).map((announcement) => (
            <Card key={announcement.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-slate-100">{announcement.title}</span>
                    {announcement.status === 'DRAFT' && (
                      <Badge variant="yellow">{announcement.scheduledFor ? t.news.scheduled : t.news.draft}</Badge>
                    )}
                    {announcement.pinned && <Badge variant="pink">📌</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {announcement.author.displayName} · {formatDate(announcement.publishedAt ?? announcement.createdAt, locale)}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label={t.common.edit} onClick={() => void loadForEdit(announcement)}>
                  <PenSquare className="h-4 w-4" />
                </Button>
                {can(PERMISSIONS.ANNOUNCEMENTS_MANAGE) && (
                  <Button variant="ghost" size="icon" aria-label={t.common.delete} className="text-danger" onClick={() => setDeleteTarget(announcement)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t.common.delete}
        description={t.news.deleteConfirm}
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await api(`/news/${deleteTarget.id}`, { method: 'DELETE' });
            toast.success(t.news.deleted);
            void queryClient.invalidateQueries({ queryKey: ['news'] });
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t.common.error);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default function NewsEditorPage() {
  return (
    <Suspense>
      <NewsEditorContent />
    </Suspense>
  );
}
