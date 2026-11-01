"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { useFinance } from "@/lib/store";
import { addDays, addMonths, daysInMonth, formatBR, monthKey, monthLabelFull, monthStart, parts, toISO, weekday, type ISODate } from "@/lib/finance/dates";
import { closingDate, dueDate } from "@/lib/finance/cards";
import { allInvoices } from "@/lib/finance/reports";
import { formatMoneyCompact, sum } from "@/lib/finance/money";
import { PageHeader } from "@/components/shell";
import { Badge, Card, CardTitle, IconButton, Money, Skeleton, cx } from "@/components/ui";
import { TxRow } from "@/components/tx-list";
import { useForms } from "@/components/forms/provider";
import type { Transaction } from "@/lib/types";
import type { Invoice } from "@/lib/finance/cards";

type Ev =
  | { kind: "tx"; date: ISODate; tx: Transaction }
  | { kind: "fecha"; date: ISODate; card: string; color: string }
  | { kind: "vence"; date: ISODate; card: string; color: string; invoice: Invoice };

const WEEK = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export default function CalendarPage() {
  const { data, today, loading } = useFinance();
  const forms = useForms();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ISODate | null>(null);
  const month = addMonths(monthStart(today), offset);
  const { y, m } = parts(month);

  const events = useMemo(() => {
    const out = new Map<string, Ev[]>();
    const push = (e: Ev) => out.set(e.date, [...(out.get(e.date) ?? []), e]);
    const from = month;
    const to = toISO(y, m, daysInMonth(y, m));
    for (const t of data.transactions) {
      if (t.kind !== "receita" && t.kind !== "despesa") continue;
      const d = t.paid_date ?? t.due_date;
      const date = t.paid_date ? t.paid_date : t.due_date;
      if (date >= from && date <= to) push({ kind: "tx", date: d, tx: t });
    }
    const invoices = allInvoices(data, today);
    for (const c of data.cards.filter((x) => !x.archived)) {
      const closing = closingDate(c, month);
      push({ kind: "fecha", date: closing, card: c.name, color: c.color });
      for (const k of [-1, 0]) {
        const invMonth = addMonths(month, k);
        const due = dueDate(c, invMonth);
        const inv = invoices.find((i) => i.cardId === c.id && i.month === invMonth);
        if (due >= from && due <= to && inv && inv.total > 0) push({ kind: "vence", date: due, card: c.name, color: c.color, invoice: inv });
      }
    }
    return out;
  }, [data, month, y, m, today]);

  if (loading) return <Skeleton className="h-96" />;

  const lead = (weekday(month) + 6) % 7; // segunda-feira primeiro
  const days = daysInMonth(y, m);
  const cells: (ISODate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => toISO(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);

  const dayTotals = (d: ISODate) => {
    const ev = events.get(d) ?? [];
    const inc = sum(ev.filter((e) => e.kind === "tx" && e.tx.kind === "receita").map((e) => (e as { tx: Transaction }).tx.amount));
    const exp = sum(ev.filter((e) => e.kind === "tx" && e.tx.kind === "despesa").map((e) => (e as { tx: Transaction }).tx.amount))
      + sum(ev.filter((e) => e.kind === "vence").map((e) => (e as { invoice: Invoice }).invoice.total));
    return { ev, inc, exp };
  };

  const sel = selected && monthKey(selected) === monthKey(month) ? selected : null;
  const list = sel
    ? [sel]
    : cells.filter((d): d is ISODate => !!d && (events.get(d)?.length ?? 0) > 0);

  return (
    <>
      <PageHeader title="Calendário financeiro" sub="Quando o dinheiro entra, quando as contas vencem e quando as faturas fecham" />
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <IconButton label="Mês anterior" onClick={() => { setOffset(offset - 1); setSelected(null); }}><ChevronLeft className="size-5" /></IconButton>
            <button className="font-semibold" onClick={() => { setOffset(0); setSelected(null); }}>{monthLabelFull(monthKey(month))}</button>
            <IconButton label="Próximo mês" onClick={() => { setOffset(offset + 1); setSelected(null); }}><ChevronRight className="size-5" /></IconButton>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500">
            {WEEK.map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const { ev, inc, exp } = dayTotals(d);
              const closes = ev.some((e) => e.kind === "fecha");
              const overdue = ev.some((e) => e.kind === "tx" && !e.tx.paid_date && e.tx.due_date < today);
              return (
                <button
                  key={d}
                  onClick={() => setSelected(sel === d ? null : d)}
                  className={cx(
                    "flex min-h-16 flex-col items-stretch rounded-xl p-1 text-left transition sm:min-h-20 sm:p-1.5",
                    sel === d ? "bg-navy-600 text-white" : "bg-slate-50 hover:bg-slate-100 dark:bg-navy-950 dark:hover:bg-navy-800",
                    d === today && sel !== d && "ring-2 ring-navy-500",
                  )}
                >
                  <span className="flex items-center justify-between text-xs font-medium">
                    {parts(d).d}
                    {closes && <CreditCard className={cx("size-3", sel === d ? "text-white" : "text-violet-500")} aria-label="Fechamento de fatura" />}
                  </span>
                  {inc > 0 && <span className={cx("mt-auto truncate text-[10px] font-medium", sel === d ? "text-emerald-200" : "text-emerald-600")}>+{formatMoneyCompact(inc).replace("R$ ", "")}</span>}
                  {exp > 0 && <span className={cx("truncate text-[10px] font-medium", inc > 0 ? "" : "mt-auto", sel === d ? "text-rose-200" : overdue ? "text-rose-700" : "text-rose-500")}>−{formatMoneyCompact(exp).replace("R$ ", "")}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span className="text-emerald-600">+ entradas</span>
            <span className="text-rose-500">− saídas e faturas</span>
            <span className="flex items-center gap-1"><CreditCard className="size-3 text-violet-500" /> fecha fatura</span>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle sub={sel ? undefined : "Toque em um dia para ver só ele"}>{sel ? formatBR(sel) : "Agenda do mês"}</CardTitle>
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nada marcado.</p>
          ) : (
            <div className="space-y-4">
              {list.map((d) => {
                const ev = events.get(d) ?? [];
                return (
                  <div key={d}>
                    {!sel && <p className="mb-1 text-xs font-semibold text-slate-500">{formatBR(d)}{d === addDays(today, 0) && " · hoje"}</p>}
                    <ul className="divide-y divide-slate-100 dark:divide-navy-800">
                      {ev.map((e, i) =>
                        e.kind === "tx" ? (
                          <TxRow key={e.tx.id} tx={e.tx} showDate={false} />
                        ) : (
                          <li key={`${e.kind}-${i}`} className="flex items-center gap-3 py-3">
                            <span className="flex size-10 items-center justify-center rounded-xl text-white" style={{ background: e.color }}>
                              <CreditCard className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{e.kind === "fecha" ? `Fecha a fatura do ${e.card}` : `Vence a fatura do ${e.card}`}</p>
                              {e.kind === "fecha" && <p className="text-xs text-slate-500">A partir de hoje, compras vão para a próxima fatura</p>}
                            </div>
                            {e.kind === "vence" && (
                              <div className="flex flex-col items-end gap-1">
                                <Money value={e.invoice.total} className="text-sm font-semibold" />
                                {e.invoice.remaining > 0 ? (
                                  <button className="text-xs font-medium text-navy-600 dark:text-navy-300" onClick={() => forms.openInvoicePay(e.invoice)}>Pagar</button>
                                ) : (
                                  <Badge tone="green">Paga</Badge>
                                )}
                              </div>
                            )}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
