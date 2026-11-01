import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import type { Insight } from "@/lib/finance/insights";
import { Card, cx } from "./ui";

export function InsightCard({ insight, compact }: { insight: Insight; compact?: boolean }) {
  const map = {
    positivo: { icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15" },
    alerta: { icon: AlertTriangle, cls: "text-amber-600 bg-amber-50 dark:bg-amber-500/15" },
    perigo: { icon: OctagonAlert, cls: "text-rose-600 bg-rose-50 dark:bg-rose-500/15" },
    info: { icon: Info, cls: "text-navy-600 bg-navy-50 dark:bg-navy-800 dark:text-navy-200" },
  }[insight.tone];
  const Icon = map.icon;
  return (
    <Card className={cx(compact && "p-4 sm:p-4")}>
      <div className="flex gap-3">
        <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-xl", map.cls)}>
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">{insight.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{insight.text}</p>
        </div>
      </div>
    </Card>
  );
}
