"use client";
import Link from "next/link";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, CreditCard, Landmark, PiggyBank, Receipt, Scale, TrendingUp, Wallet } from "lucide-react";
import { useFinance } from "@/lib/store";
import { addDays, formatBR, monthKey, monthLabel, monthRange, addMonths, monthStart } from "@/lib/finance/dates";
import { accountBalance } from "@/lib/finance/ledger";
import { cardUsage } from "@/lib/finance/cards";
import { loanStatus } from "@/lib/finance/loans";
import { allInvoices, budgetStatus, byCategory, cashFlow, entriesIn, netWorthSeries, pendingCommitments, resultByMonth, totals } from "@/lib/finance/reports";
import { analyze } from "@/lib/finance/insights";
import { sum } from "@/lib/finance/money";
import { PageHeader } from "@/components/shell";
import { PeriodBar, usePeriod } from "@/components/tx-list";
import { Button, Card, CardTitle, EmptyState, Money, Progress, Skeleton, cx } from "@/components/ui";
import { AreaMoneyChart, C, CashFlowChart, CategoryDonut, HorizontalBars, IncomeExpenseChart, LineMoneyChart } from "@/components/charts";
import { useForms } from "@/components/forms/provider";
import { InsightCard } from "@/components/insight-card";

function Stat({
  label, value, icon: Icon, tone = "navy", sub, href,
}: { label: string; value: number; icon: typeof Wallet; tone?: "navy" | "green" | "red" | "amber" | "violet"; sub?: React.ReactNode; href?: string }) {
  const tones = {
    navy: "bg-navy-50 text-navy-700 dark:bg-navy-800 dark:text-navy-200",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    red: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  };
  const body = (
    <Card className="h-full p-4 transition hover:ring-navy-200 sm:p-4 dark:hover:ring-navy-600">
      <div className="flex items-center gap-2">
        <span className={cx("flex size-8 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="size-4" />
        </span>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <Money value={value} className="mt-2 block text-lg font-semibold tracking-tight" />
      {sub && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function Dashboard() {
  const { data, entries, today, loading } = useFinance();
  const p = usePeriod("mes");
  const forms = useForms();

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );

  const { from, to } = p.range;
  const periodEntries = entriesIn(entries, from, to);
  const t = totals(periodEntries);
  const balance = sum(data.accounts.filter((a) => !a.archived).map((a) => accountBalance(a, data.transactions)));
  const commitments = pendingCommitments(data, today);
  const inPeriod = commitments.filter((c) => c.date >= from && c.date <= to);
  const toPay = sum(inPeriod.filter((c) => c.type !== "receita").map((c) => c.amount));
  const toReceive = sum(inPeriod.filter((c) => c.type === "receita").map((c) => c.amount));
  const overdue = commitments.filter((c) => c.overdue && c.type !== "receita");
  const in30 = addDays(today, 30);
  const future = commitments.filter((c) => c.type !== "receita" && c.date > today && c.date <= in30);
  const cards = data.cards.filter((c) => !c.archived);
  const usages = cards.map((c) => cardUsage(c, data.installments, data.transactions));
  const loanDebt = sum(data.loans.map((l) => loanStatus(l, data.transactions, today).balance));
  const cardDebt = sum(data.cards.map((c) => cardUsage(c, data.installments, data.transactions).used));
  const openInvoices = allInvoices(data, today).filter((i) => i.remaining > 0 && i.status !== "futura");

  const chartMonths = p.period === "ano" ? monthRange(from, to) : monthRange(addMonths(monthStart(to), -5), to);
  const monthly = resultByMonth(entries, chartMonths).map((r) => ({ ...r, label: monthLabel(r.month) }));
  const last12 = monthRange(addMonths(monthStart(today), -11), today);
  const evolution = resultByMonth(entries, last12).map((r) => ({ label: monthLabel(r.month), saldo: r.saldo }));
  const worth = netWorthSeries(data, last12, today).map((r) => ({ label: monthLabel(r.month), patrimonio: r.patrimonio, dividas: r.dividas }));
  const flow = cashFlow(data.transactions, chartMonths).map((r) => ({ ...r, label: monthLabel(r.month) }));
  const cats = byCategory(periodEntries, data.categories, "despesa");
  const prev = p.period === "semana" ? { from: addDays(from, -7), to: addDays(to, -7) } : { from: addMonths(from, -(p.period === "ano" ? 12 : p.period === "trimestre" ? 3 : 1)), to: addDays(from, -1) };
  const prevCats = new Map(byCategory(entriesIn(entries, prev.from, prev.to), data.categories, "despesa").map((c) => [c.id, c.amount]));
  const comparison = cats.slice(0, 6).map((c) => ({ name: c.name, atual: c.amount, anterior: prevCats.get(c.id) ?? 0 }));
  const budgets = budgetStatus(data.budgets, data.categories, entries, monthKey(today)).filter((b) => b.level !== "ok");
  const insights = analyze(data, today, entries).filter((i) => i.tone !== "info").slice(0, 2);
  const upcoming = commitments.filter((c) => c.date <= addDays(today, 7)).slice(0, 6);

  const empty = !data.accounts.length && !data.transactions.length && !data.cards.length;

  return (
    <>
      <PageHeader title="Visão geral" sub={`Hoje é ${formatBR(today)}`} actions={<PeriodBar p={p} />} />

      {empty && (
        <Card className="mb-5 bg-gradient-to-br from-navy-700 to-navy-900 text-white ring-0 dark:from-navy-800 dark:to-navy-950">
          <p className="text-lg font-semibold">Vamos começar?</p>
          <p className="mt-1 text-sm text-navy-100">Três passos e seu painel ganha vida:</p>
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <li className="rounded-xl bg-white/10 p-3">1. Cadastre suas contas e o saldo de hoje.</li>
            <li className="rounded-xl bg-white/10 p-3">2. Cadastre seus cartões de crédito.</li>
            <li className="rounded-xl bg-white/10 p-3">3. Lance receitas, despesas e contas fixas.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => forms.openAccount()}>Cadastrar conta</Button>
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => forms.openCard()}>Cadastrar cartão</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo disponível" value={balance} icon={Wallet} href="/contas" sub={`${data.accounts.filter((a) => !a.archived).length} contas`} />
        <Stat label="Receitas" value={t.receitas} icon={ArrowUpCircle} tone="green" href="/receitas" sub={<>recebido <Money value={t.recebido} /></>} />
        <Stat label="Despesas" value={t.despesas} icon={ArrowDownCircle} tone="red" href="/despesas" sub={<>pago ou no cartão <Money value={t.pago} /></>} />
        <Stat label="Saldo do período" value={t.saldo} icon={Scale} tone={t.saldo >= 0 ? "green" : "red"} sub="receitas − despesas" />
        <Stat label="A pagar no período" value={toPay} icon={Receipt} tone="amber" href="/a-pagar" sub="contas e faturas" />
        <Stat label="A receber no período" value={toReceive} icon={PiggyBank} tone="green" href="/a-receber" />
        <Stat label="Vencidas" value={sum(overdue.map((o) => o.amount))} icon={AlertTriangle} tone="red" href="/a-pagar" sub={`${overdue.length} em atraso`} />
        <Stat label="Próximos 30 dias" value={sum(future.map((f) => f.amount))} icon={CalendarClock} tone="amber" href="/calendario" sub="despesas futuras" />
        <Stat label="Total das dívidas" value={loanDebt + cardDebt} icon={Landmark} tone="red" href="/dividas" sub={<>empréstimos <Money value={loanDebt} /></>} />
        <Stat label="Limite disponível" value={sum(usages.map((u) => u.available))} icon={CreditCard} tone="violet" href="/cartoes" sub={`de ${cards.length} cartões`} />
        <Stat label="Faturas em aberto" value={sum(openInvoices.map((i) => i.remaining))} icon={CreditCard} tone="violet" href="/cartoes" sub={`${openInvoices.length} faturas`} />
        <Stat label="Patrimônio" value={worth.at(-1)?.patrimonio ?? 0} icon={TrendingUp} href="/relatorios" sub="contas − dívidas" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub="Por mês">Receitas x despesas</CardTitle>
          {monthly.some((m) => m.receitas || m.despesas) ? <IncomeExpenseChart data={monthly} /> : <EmptyState title="Sem lançamentos nesses meses" />}
        </Card>
        <Card>
          <CardTitle sub={p.title}>Despesas por categoria</CardTitle>
          {cats.length ? <CategoryDonut data={cats} /> : <EmptyState title="Nenhuma despesa no período" />}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardTitle action={<Link href="/a-pagar" className="text-xs font-medium text-navy-600 dark:text-navy-300">Ver tudo</Link>}>Próximos vencimentos</CardTitle>
          {upcoming.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-navy-800">
              {upcoming.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.description}</p>
                    <p className={cx("text-xs", c.overdue ? "text-rose-600" : "text-slate-500")}>{c.overdue ? "Venceu" : "Vence"} em {formatBR(c.date)}</p>
                  </div>
                  <Money value={c.type === "receita" ? c.amount : -c.amount} signed colored className="text-sm font-semibold" />
                  {c.tx ? (
                    <Button size="sm" variant="secondary" onClick={() => forms.openSettle(c.tx!)}>{c.type === "receita" ? "Receber" : "Pagar"}</Button>
                  ) : c.invoice ? (
                    <Button size="sm" variant="secondary" onClick={() => forms.openInvoicePay(c.invoice!)}>Pagar</Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nada vencendo nos próximos 7 dias" />
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle sub="Últimos 12 meses: contas − cartões − empréstimos">Evolução do patrimônio</CardTitle>
          <LineMoneyChart data={worth} lines={[{ key: "patrimonio", name: "Patrimônio", color: C.navy }, { key: "dividas", name: "Dívidas", color: C.expense, dashed: true }]} />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle sub="Dinheiro que entrou e saiu das contas (faturas incluídas, transferências não)">Fluxo de caixa</CardTitle>
          <CashFlowChart data={flow} />
        </Card>
        <Card>
          <CardTitle sub="Receitas − despesas de cada mês, últimos 12 meses">Evolução financeira mensal</CardTitle>
          <AreaMoneyChart data={evolution} dataKey="saldo" name="Saldo do mês" zeroLine />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub="Maiores categorias do período contra o período anterior">Comparativo entre períodos</CardTitle>
          {comparison.length ? <HorizontalBars data={comparison} /> : <EmptyState title="Sem despesas para comparar" />}
        </Card>
        <div className="space-y-5">
          {budgets.length > 0 && (
            <Card>
              <CardTitle action={<Link href="/planejamento" className="text-xs font-medium text-navy-600 dark:text-navy-300">Orçamento</Link>}>Alertas de orçamento</CardTitle>
              <ul className="space-y-3">
                {budgets.slice(0, 4).map((b) => (
                  <li key={b.budget.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{b.category?.name}</span>
                      <span className={cx("tabular text-xs", b.level === "estourado" ? "text-rose-600" : "text-amber-600")}>{Math.round(b.pct)}%</span>
                    </div>
                    <Progress value={b.pct} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} compact />
          ))}
          {!budgets.length && !insights.length && (
            <Card>
              <CardTitle>Inteligência financeira</CardTitle>
              <p className="text-sm text-slate-500">As análises aparecem conforme você registra lançamentos.</p>
              <Link href="/inteligencia" className="mt-2 inline-block text-sm font-medium text-navy-600 dark:text-navy-300">Abrir</Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
