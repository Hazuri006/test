'use client';

import { use } from 'react';
import { ConversationList } from '@/components/messages/conversation-list';
import { Chat } from '@/components/messages/chat';
import { useT } from '@/lib/i18n';

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();

  return (
    <div className="glass flex h-[calc(100dvh-8.5rem)] overflow-hidden rounded-xl2">
      <div className="hidden w-80 shrink-0 overflow-y-auto border-r border-spirit-400/10 p-3 md:block">
        <h1 className="px-2 py-2 text-lg font-bold text-white">{t.messages.title}</h1>
        <ConversationList activeId={id} />
      </div>
      <div className="min-w-0 flex-1">
        <Chat conversationId={id} />
      </div>
    </div>
  );
}
