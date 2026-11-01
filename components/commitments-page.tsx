"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, CreditCard, Plus, Repeat } from "lucide-react";
import { useFinance } from "@/lib/store";
import { addDays, addMonths, formatBR, monthEnd, monthStart } from "@/lib/finance/dates";
import { pendingCommitments } from "@/lib/finance/reports";
import { formatMoney, sum } from "@/lib/finance/money";
import { PageHeader } from "./shell";
import { TxList, TxRow } from "./tx-list";
import { Badge, Button, Card, CardTitle, EmptyState, Money, Segmented, Select, cx } from "./ui";
import { useForms } from "./forms/provider";

type Filter = "todos" | "atrasados" | "7dias" | "mes" | "proximo";

export function CommitmentsPage({ kind }: { kind: "receita" | "despesa" }) {
  const { data, today } = useFinance();
  const forms = useForms();
  const [tab, setTab] = useState<"pendentes" | "historico" | "recorrentes">("pendentes");
  const [filter, setFilter] = useState<Filter>("todos");
  const isIncome = kind === "receita";

  const all = useMemo(
    () => pendingCommitments(data, today).filter((c) => (isIncome ? c.type === "receita" : c.type !== "receita")),
    [data, today, isIncome],
  );
  const range: Record<Filter, (d: string, overdue: boolean) => boolean> = {
    todos: () => true,
    atrasados: (_, o) => o,
    "7dias": (d) => d >= today && d <= addDays(today, 7),
    mes: (d) => d >= monthStart(today) && d <= monthEnd(today),
    proximo: (d) => d >= addMonths(monthStart(today), 1) && d <= monthEnd(addMonths(monthStart(today), 1)),
  };
  const list = all.filter((c) => range[filter](c.date, c.overdue));
  const overdue = all.filter((c) => c.overdue);
  const dueToday = all.filter((c) => c.date === today);
  const week = all.filter((c) => c.date > today && c.date <= addDays(today, 7));

  const history = data.transactions
    .filter((t) => t.kind === kind && t.paid_date)
    .concat(isIncome ? [] : data.transactions.filter((t) => t.kind === "fatura"))
    .sort((a, b) => b.paid_date!.localeCompare(a.paid_date!))
    .slice(0, 100);

  const series = useMemo(() => {
    const g = new Map<string, typeof data.transactions>();
    for (const t of data.transactions) if (t.kind === kind && t.recurrence_id) g.set(t.recurrence_id, [...(g.get(t.recurrence_id) ?? []), t]);
    return [...g.values()].map((txs) => {
      txs.sort((a, b) => a.due_date.localeCompare(b.due_date));
      return { first: txs[0], count: txs.length, paid: txs.filter((t) => t.paid_date).length, next: txs.find((t) => !t.paid_date) ?? null, amount: txs.at(-1)!.amount };
    }).filter((s) => s.next).sort((a, b) => a.next!.due_date.localeCompare(b.next!.due_date));
  }, [data.transactions, kind]);

  return (
    <>
      <PageHeader
        title={isIncome ? "Contas a receber" : "Contas a pagar"}
        sub={isIncome ? "O que ainda vai entrar" : "Compromissos, faturas e parcelas que ainda vão vencer"}
        actions={
          <Button onClick={() => forms.openTx({ kind })} icon={<Plus className="size-4" />} variant={isIncome ? "success" : "primary"}>
            {isIncome ? "Nova conta a receber" : "Nova conta a pagar"}
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <button onClick={() => { setTab("pendentes"); setFilter("atrasados"); }} className="text-left">
          <Card className={cx("p-4 sm:p-4", overdue.length && "ring-rose-200 dark:ring-rose-900")}>
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><AlertTriangle className="size-3.5 text-rose-500" />Atrasadas</p>
            <Money value={sum(overdue.map((c) => c.amount))} className="text-lg font-semibold text-rose-600" />
            <p className="text-[11px] text-slate-500">{overdue.length} {overdue.length === 1 ? "conta" : "contas"}</p>
          </Card>
        </button>
        <Card className="p-4 sm:p-4">
          <p className="text-xs text-slate-500">Vencem hoje</p>
          <Money value={sum(dueToday.map((c) => c.amount))} className="text-lg font-semibold text-amber-600" />
          <p className="text-[11px] text-slate-500">{dueToday.length} {dueToday.length === 1 ? "conta" : "contas"}</p>
        </Card>
        <button onClick={() => { setTab("pendentes"); setFilter("7dias"); }} className="text-left">
          <Card className="p-4 sm:p-4">
            <p className="text-xs text-slate-500">Próximos 7 dias</p>
            <Money value={sum(week.map((c) => c.amount))} className="text-lg font-semibold" />
            <p className="text-[11px] text-slate-500">{week.length} {week.length === 1 ? "conta" : "contas"}</p>
          </Card>
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "pendentes", label: "Pendentes" },
            { value: "historico", label: isIncome ? "Recebimentos" : "Pagamentos" },
            { value: "recorrentes", label: "Recorrentes" },
          ]}
        />
        {tab === "pendentes" && (
          <Select className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="todos">Todos os vencimentos</option>
            <option value="atrasados">Atrasadas</option>
            <option value="7dias">Próximos 7 dias</option>
            <option value="mes">Este mês</option>
            <option value="proximo">Próximo mês</option>
          </Select>
        )}
      </div>

      {tab === "pendentes" && (
        <Card>
          <CardTitle sub={`${list.length} itens · ${formatMoney(sum(list.map((c) => c.amount)))}`}>Pendentes</CardTitle>
          {list.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {list.map((c) =>
                c.tx ? (
                  <TxRow key={c.id} tx={c.tx} />
                ) : (
                  <li key={c.id} className="flex items-center gap-3 py-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-violet-600 text-white">
                      <CreditCard className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.description}</p>
                      <p className="text-xs text-slate-500">Vence em {formatBR(c.date)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Money value={-c.amount} signed className="text-sm font-semibold" />
                      <Badge tone={c.overdue ? "red" : c.invoice?.status === "fechada" ? "amber" : "blue"}>
                        {c.overdue ? "Atrasada" : c.invoice?.status === "fechada" ? "Fechada" : "Aberta"}
                      </Badge>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => forms.openInvoicePay(c.invoice!)}>Pagar</Button>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <EmptyState icon={<CalendarCheck className="size-6" />} title="Tudo em dia por aqui" text="Nenhuma conta pendente com esse filtro." />
          )}
        </Card>
      )}

      {tab === "historico" && (
        <Card>
          <CardTitle sub="Os 100 mais recentes">{isIncome ? "Histórico de recebimentos" : "Histórico de pagamentos"}</CardTitle>
          <TxList txs={history} empty={<EmptyState title="Nada registrado ainda" />} />
        </Card>
      )}

      {tab === "recorrentes" && (
        <Card>
          <CardTitle sub="Lançamentos que se repetem e ainda têm ocorrências pendentes">Contas recorrentes</CardTitle>
          {series.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {series.map((s) => (
                <li key={s.first.recurrence_id} className="flex items-center gap-3 py-3">
                  <Repeat className="size-4 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.first.description}</p>
                    <p className="text-xs text-slate-500">
                      {s.paid}/{s.count} {isIncome ? "recebidas" : "pagas"} · próxima em {formatBR(s.next!.due_date)}
                    </p>
                  </div>
                  <Money value={s.amount} className="text-sm font-semibold" />
                  <Button size="sm" variant="secondary" onClick={() => forms.openSettle(s.next!)}>{isIncome ? "Receber" : "Pagar"}</Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Repeat className="size-6" />} title="Nenhuma conta recorrente" text={`Ao cadastrar ${isIncome ? "uma receita" : "uma despesa"}, escolha "Repetir" para criar as próximas automaticamente.`} />
          )}
        </Card>
      )}
    </>
  );
}
