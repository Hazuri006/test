'use client';

import { MessageSquare } from 'lucide-react';
import { ConversationList } from '@/components/messages/conversation-list';
import { useT } from '@/lib/i18n';

export default function MessagesPage() {
  const t = useT();
  return (
    <div className="glass flex h-[calc(100dvh-8.5rem)] overflow-hidden rounded-xl2">
      <div className="w-full overflow-y-auto p-3 md:w-80 md:border-r md:border-spirit-400/10">
        <h1 className="px-2 py-2 text-lg font-bold text-white">{t.messages.title}</h1>
        <ConversationList />
      </div>
      <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-slate-500 md:flex">
        <MessageSquare className="h-10 w-10 text-spirit-400/40" aria-hidden />
        <p className="text-sm">{t.messages.selectConversation}</p>
      </div>
    </div>
  );
}
