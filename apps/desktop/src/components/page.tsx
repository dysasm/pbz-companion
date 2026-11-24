import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card/80 shadow-xs', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="font-heading text-sm font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={cn('p-4', contentClassName)}>{children}</div>
    </section>
  );
}

export function StatTile({
  icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card/80 p-4 shadow-xs">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={cn('[&_svg]:size-4', accent ? 'text-brand' : 'text-muted-foreground')}>{icon}</span>
      </div>
      <div className={cn('numeric mt-2 font-heading text-xl font-semibold tracking-tight', accent && 'text-brand')}>
        {value}
      </div>
      {detail && <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border bg-card/70 p-2.5', className)}>
      {children}
    </div>
  );
}

export function EmptyPanel({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-6 py-12 text-center">
      <div className="mb-3 rounded-xl bg-muted/60 p-3 text-muted-foreground [&_svg]:size-5">{icon}</div>
      <div className="font-heading text-sm font-semibold">{title}</div>
      {description && <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
