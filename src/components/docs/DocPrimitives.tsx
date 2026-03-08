import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, Info, Lightbulb, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface DocHeroProps {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
}

export function DocHero({ title, subtitle, icon: Icon }: DocHeroProps) {
  return (
    <div className="mb-8 pb-6 border-b border-border">
      <div className="flex items-center gap-3 mb-2">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="text-primary" size={22} />
          </div>
        )}
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      </div>
      <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{subtitle}</p>
    </div>
  );
}

interface DocSectionProps {
  title: string;
  children: ReactNode;
  id?: string;
}

export function DocSection({ title, children, id }: DocSectionProps) {
  return (
    <section id={id} className="mb-8">
      <h2 className="text-lg font-semibold text-foreground mb-3 pb-2 border-b border-border/50">{title}</h2>
      <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">{children}</div>
    </section>
  );
}

interface DocSubSectionProps {
  title: string;
  children: ReactNode;
}

export function DocSubSection({ title, children }: DocSubSectionProps) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      <div className="space-y-2 text-sm text-foreground/80 leading-relaxed">{children}</div>
    </div>
  );
}

interface DocInfoCardProps {
  variant?: 'info' | 'tip' | 'warning' | 'success';
  title?: string;
  children: ReactNode;
}

const cardStyles = {
  info: { bg: 'bg-blue-500/5 border-blue-500/20', icon: Info, color: 'text-blue-600' },
  tip: { bg: 'bg-amber-500/5 border-amber-500/20', icon: Lightbulb, color: 'text-amber-600' },
  warning: { bg: 'bg-destructive/5 border-destructive/20', icon: AlertTriangle, color: 'text-destructive' },
  success: { bg: 'bg-green-500/5 border-green-500/20', icon: CheckCircle2, color: 'text-green-600' },
};

export function DocInfoCard({ variant = 'info', title, children }: DocInfoCardProps) {
  const style = cardStyles[variant];
  const Icon = style.icon;
  return (
    <div className={cn('rounded-lg border p-3.5', style.bg)}>
      <div className="flex gap-2.5">
        <Icon size={16} className={cn('shrink-0 mt-0.5', style.color)} />
        <div className="text-sm">
          {title && <p className={cn('font-semibold mb-1', style.color)}>{title}</p>}
          <div className="text-foreground/80 leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface DocStepProps {
  number: number;
  title: string;
  children: ReactNode;
}

export function DocStep({ number, title, children }: DocStepProps) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
        {number}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-foreground mb-1">{title}</p>
        <div className="text-sm text-foreground/80 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

interface DocListProps {
  items: string[];
}

export function DocList({ items }: DocListProps) {
  return (
    <ul className="space-y-1.5 ml-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span className="text-primary mt-1.5 shrink-0">•</span>
          <span className="text-foreground/80">{item}</span>
        </li>
      ))}
    </ul>
  );
}

interface DocTableProps {
  headers: string[];
  rows: string[][];
}

export function DocTable({ headers, rows }: DocTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border/50">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-foreground/80">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
