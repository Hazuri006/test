'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { ConversationDTO } from '@yurei/shared';

/** Actions communes envers un autre membre (ajouter, écrire, bloquer). */
export function useUserActions() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useT();

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['friends'] });
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  return {
    async addFriend(userId: string): Promise<void> {
      try {
        await api('/friends/requests', { method: 'POST', body: { userId } });
        toast.success(t.friends.requestSent);
        invalidate();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t.common.error);
      }
    },
    async openConversation(userId: string): Promise<void> {
      try {
        const conversation = await api<ConversationDTO>('/conversations', {
          method: 'POST',
          body: { userId },
        });
        router.push(`/messages/${conversation.id}`);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t.common.error);
      }
    },
    async block(userId: string): Promise<void> {
      try {
        await api('/friends/block', { method: 'POST', body: { userId } });
        toast.success(t.friends.block);
        invalidate();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t.common.error);
      }
    },
    async unblock(userId: string): Promise<void> {
      try {
        await api('/friends/unblock', { method: 'POST', body: { userId } });
        invalidate();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t.common.error);
      }
    },
  };
}
