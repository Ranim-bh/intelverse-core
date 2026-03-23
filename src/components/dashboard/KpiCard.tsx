import { useCountUp } from "@/hooks/use-count-up";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  icon: LucideIcon;
  trend?: number;
  alert?: boolean;
  decimals?: number;
}

export function KpiCard({ title, value, prefix = "", suffix = "", icon: Icon, trend, alert, decimals = 0 }: KpiCardProps) {
  const animatedValue = useCountUp(value, 1200, decimals);

  return (
    <div className={`glass-card p-5 animate-slide-up ${alert ? 'border-destructive/50' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        <div className={`p-2 rounded-lg ${alert ? 'bg-destructive/20' : 'bg-primary/10'}`}>
          <Icon className={`h-4 w-4 ${alert ? 'text-destructive' : 'text-primary'}`} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="font-mono text-2xl font-bold text-foreground">
          {prefix}{animatedValue.toLocaleString()}{suffix}
        </span>
        {trend !== undefined && (
          <span className={`text-xs font-medium mb-1 ${trend >= 0 ? 'text-success' : 'text-destructive'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}
