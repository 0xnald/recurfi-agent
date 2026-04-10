import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  className?: string;
}

export function StatCard({ label, value, sub, icon: Icon, className }: StatCardProps) {
  return (
    <div className={cn(
      "rounded-lg border border-border/50 bg-card p-5 transition-all hover:border-silver-dark/30 hover:glow-silver",
      className
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="rounded-md bg-accent p-2">
          <Icon className="h-4 w-4 text-silver" />
        </div>
      </div>
    </div>
  );
}
