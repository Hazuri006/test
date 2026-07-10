'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn, initials } from '@/lib/utils';
import type { PresenceStatus } from '@yurei/shared';

const statusColors: Record<PresenceStatus, string> = {
  ONLINE: 'bg-success',
  AWAY: 'bg-warning',
  OFFLINE: 'bg-slate-500',
};

interface UserAvatarProps {
  src: string | null | undefined;
  name: string;
  size?: number;
  status?: PresenceStatus;
  className?: string;
}

export function UserAvatar({ src, name, size = 40, status, className }: UserAvatarProps) {
  return (
    <div className={cn('relative inline-block shrink-0', className)} style={{ width: size, height: size }}>
      <AvatarPrimitive.Root
        className="block h-full w-full overflow-hidden rounded-full border border-spirit-400/20 bg-night-700"
      >
        {src ? (
          <AvatarPrimitive.Image
            src={src}
            alt={name}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <AvatarPrimitive.Fallback
          delayMs={src ? 300 : 0}
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-spirit-600/60 to-haze-500/60 font-semibold text-white"
          style={{ fontSize: size * 0.36 }}
        >
          {initials(name)}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
      {status && (
        <span
          aria-label={status}
          className={cn(
            'absolute bottom-0 right-0 block rounded-full border-2 border-night-900',
            statusColors[status],
          )}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
        />
      )}
    </div>
  );
}
