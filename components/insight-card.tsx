import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import type { Insight } from "@/lib/finance/insights";
import { Card, cx } from "./ui";

export function InsightCard({ insight, compact, bare }: { insight: Insight; compact?: boolean; bare?: boolean }) {
  const map = {
    positivo: { icon: CheckCircle2, cls: "text-brand-700 bg-brand-50 ring-1 ring-brand-200/70 dark:text-brand-400 dark:bg-brand-400/10 dark:ring-brand-400/20" },
    alerta: { icon: AlertTriangle, cls: "text-amber-600 bg-amber-50 ring-1 ring-amber-200/70 dark:text-amber-300 dark:bg-amber-400/10 dark:ring-amber-400/20" },
    perigo: { icon: OctagonAlert, cls: "text-rose-600 bg-rose-50 ring-1 ring-rose-200/70 dark:text-rose-400 dark:bg-rose-500/10 dark:ring-rose-400/20" },
    info: { icon: Info, cls: "text-slate-700 bg-slate-100 dark:bg-tint/[0.06] dark:text-slate-200" },
  }[insight.tone];
  const Icon = map.icon;
  if (bare)
    // sem cartão próprio: para usar dentro de outra superfície
    return (
      <div className="flex gap-3">
        <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-xl", map.cls)}>
          <Icon className="size-4" strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{insight.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{insight.text}</p>
        </div>
      </div>
    );
  return (
    <Card className={cx(compact && "p-4 sm:p-4")}>
      <div className="flex gap-3">
        <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl", map.cls)}>
          <Icon className="size-5" strokeWidth={2.1} />
        </span>
        <div>
          <p className="text-sm font-semibold">{insight.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{insight.text}</p>
        </div>
      </div>
    </Card>
  );
}
