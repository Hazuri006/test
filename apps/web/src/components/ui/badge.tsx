import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';
import type { RoleName, TicketPriority, TicketStatus } from '@yurei/shared';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
  {
    variants: {
      variant: {
        default: 'bg-spirit-500/15 text-spirit-300 border border-spirit-400/25',
        blue: 'bg-haze-500/15 text-haze-400 border border-haze-400/25',
        pink: 'bg-bloom-500/15 text-bloom-400 border border-bloom-400/25',
        green: 'bg-success/15 text-success border border-success/25',
        yellow: 'bg-warning/15 text-warning border border-warning/25',
        red: 'bg-danger/15 text-danger border border-danger/25',
        gray: 'bg-slate-500/15 text-slate-400 border border-slate-400/25',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export const roleBadgeVariant: Record<RoleName, BadgeProps['variant']> = {
  MEMBER: 'gray',
  SUPPORT: 'green',
  MODERATOR: 'blue',
  ADMIN: 'pink',
  OWNER: 'default',
};

export const statusBadgeVariant: Record<TicketStatus, BadgeProps['variant']> = {
  OPEN: 'blue',
  WAITING_USER: 'yellow',
  WAITING_STAFF: 'pink',
  CLAIMED: 'default',
  RESOLVED: 'green',
  CLOSED: 'gray',
  ARCHIVED: 'gray',
};

export const priorityBadgeVariant: Record<TicketPriority, BadgeProps['variant']> = {
  LOW: 'gray',
  MEDIUM: 'blue',
  HIGH: 'yellow',
  URGENT: 'red',
};
