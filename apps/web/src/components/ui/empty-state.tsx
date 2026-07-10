import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-dashed border-spirit-400/15 px-6 py-14 text-center">
      <div className="rounded-2xl bg-spirit-500/10 p-4">
        <Icon className="h-7 w-7 text-spirit-400" aria-hidden />
      </div>
      <p className="font-medium text-slate-300">{title}</p>
      {children && <div className="text-sm text-slate-500">{children}</div>}
    </div>
  );
}
