'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef } from 'react';

export function Switch({ className, ...props }: ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full border border-spirit-400/20 bg-night-700 transition-colors data-[state=checked]:bg-spirit-600',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-slate-300 shadow transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-white" />
    </SwitchPrimitive.Root>
  );
}
