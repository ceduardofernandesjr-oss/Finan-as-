"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, CreditCard, Eye, EyeOff, Landmark, PiggyBank, Receipt, Scale, TrendingUp, Wallet } from "lucide-react";
import { useFinance } from "@/lib/store";
import { addDays, formatBR, monthEnd, monthKey, monthLabel, monthRange, addMonths, monthStart } from "@/lib/finance/dates";
import { accountBalance } from "@/lib/finance/ledger";
import { cardUsage } from "@/lib/finance/cards";
import { loanStatus } from "@/lib/finance/loans";
import { allInvoices, budgetStatus, byCategory, cashFlow, entriesIn, netWorthSeries, pendingCommitments, projectBalance, resultByMonth, totals } from "@/lib/finance/reports";
import { analyze } from "@/lib/finance/insights";
import { formatMoney, sum } from "@/lib/finance/money";
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
    navy: "bg-slate-100 text-slate-700 ring-slate-200/80 dark:bg-white/[0.06] dark:text-slate-200 dark:ring-white/10",
    green: "bg-brand-50 text-brand-700 ring-brand-200/80 dark:bg-brand-400/10 dark:text-brand-400 dark:ring-brand-400/20",
    red: "bg-rose-50 text-rose-600 ring-rose-200/80 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/20",
    amber: "bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
    violet: "bg-violet-50 text-violet-700 ring-violet-200/80 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20",
  };
  const body = (
    <Card className="group h-full p-4 transition duration-200 hover:-translate-y-0.5 hover:ring-slate-300 sm:p-4 dark:hover:ring-white/15">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <span className={cx("flex size-8 items-center justify-center rounded-xl ring-1 ring-inset transition group-hover:scale-105", tones[tone])}>
          <Icon className="size-4" strokeWidth={2.1} />
        </span>
      </div>
      <Money value={value} className="mt-2 block text-xl font-semibold" />
      {sub && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href} className="block rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400">{body}</Link> : body;
}

/** Destaque do topo: saldo disponível nas contas, saldo de cada conta e a previsão até o fim do mês. */
const CHAVE_OCULTAR = "financas.ocultarSaldo";
const OCULTO = "R$ ••••••";

function SaldoDestaque({ balance, accounts, previsto, ate }: { balance: number; accounts: { id: string; name: string; color: string; saldo: number }[]; previsto: number; ate: string }) {
  // a escolha fica guardada neste aparelho
  const [oculto, setOculto] = useState(false);
  useEffect(() => {
    try { setOculto(localStorage.getItem(CHAVE_OCULTAR) === "1"); } catch { /* armazenamento bloqueado */ }
  }, []);
  const alternar = () =>
    setOculto((v) => {
      try { localStorage.setItem(CHAVE_OCULTAR, v ? "0" : "1"); } catch { /* armazenamento bloqueado */ }
      return !v;
    });
  const valor = (c: number) => (oculto ? OCULTO : formatMoney(c));
  return (
    <Card className="relative mb-5 overflow-hidden !bg-navy-950 p-5 text-white !ring-white/[0.06] sm:p-7 dark:!bg-navy-900 dark:!ring-brand-400/15">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-brand-400/25 blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 right-24 size-64 rounded-full bg-brand-400/10 blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1px)] bg-[size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent_60%)]" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-slate-300">
            <span className="flex size-8 items-center justify-center rounded-xl bg-brand-400 text-navy-950"><Wallet className="size-4" strokeWidth={2.3} /></span>
            Saldo disponível
            <button
              type="button"
              onClick={alternar}
              aria-label={oculto ? "Mostrar saldo" : "Ocultar saldo"}
              aria-pressed={oculto}
              title={oculto ? "Mostrar saldo" : "Ocultar saldo"}
              className="flex size-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90 focus-visible:outline-2 focus-visible:outline-brand-400"
            >
              {oculto ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </p>
          <p className={cx("money mt-3 text-4xl font-semibold sm:text-5xl", !oculto && balance < 0 && "text-rose-300")} aria-live="polite">{valor(balance)}</p>
          <p className="mt-2 text-sm text-slate-400">
            Previsto para {ate}: <span className={cx("money font-semibold", !oculto && previsto < 0 ? "text-rose-300" : "text-brand-400")}>{valor(previsto)}</span>
          </p>
        </div>
        <Link href="/contas" className="rounded-xl bg-white/[0.08] px-3.5 py-2 text-sm font-medium ring-1 ring-white/10 transition hover:bg-brand-400 hover:text-navy-950 hover:ring-brand-400 active:scale-95">Ver contas</Link>
      </div>
      {accounts.length > 0 && (
        <ul className="relative mt-5 flex flex-wrap gap-2">
          {accounts.map((a) => (
            <li key={a.id}>
              <Link href={`/contas/${a.id}`} className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs ring-1 ring-white/10 transition hover:bg-white/[0.12]">
                <span className="size-2 rounded-full" style={{ background: a.color }} />
                <span className="text-slate-300">{a.name}</span>
                <span className={cx("money font-semibold", !oculto && a.saldo < 0 ? "text-rose-300" : "text-white")}>{valor(a.saldo)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
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
  const contasAtivas = data.accounts
    .filter((a) => !a.archived)
    .map((a) => ({ id: a.id, name: a.name, color: a.color, saldo: accountBalance(a, data.transactions) }))
    .sort((a, b) => b.saldo - a.saldo);
  const balance = sum(contasAtivas.map((a) => a.saldo));
  const fimMes = monthEnd(today);
  const previsto = data.accounts.length ? projectBalance(data, today, fimMes).end : balance;
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
        <Card className="relative mb-5 overflow-hidden !bg-navy-950 text-white !ring-white/[0.06] sm:p-7 dark:!bg-navy-900 dark:!ring-brand-400/15">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-brand-400/25 blur-[90px]" />
          <p className="relative text-xl font-semibold tracking-tight">Vamos começar?</p>
          <p className="relative mt-1 text-sm text-slate-400">Três passos e seu painel ganha vida:</p>
          <ol className="relative mt-4 grid gap-2 text-sm sm:grid-cols-3">
            {["Cadastre suas contas e o saldo de hoje.", "Cadastre seus cartões de crédito.", "Lance receitas, despesas e contas fixas."].map((t, i) => (
              <li key={t} className="flex gap-3 rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/[0.08]">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-400 text-xs font-bold text-navy-950">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          <div className="relative mt-5 flex flex-wrap gap-2">
            <Button onClick={() => forms.openAccount()}>Cadastrar conta</Button>
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => forms.openCard()}>Cadastrar cartão</Button>
          </div>
        </Card>
      )}

      {!empty && <SaldoDestaque balance={balance} accounts={contasAtivas} previsto={previsto} ate={`${formatBR(fimMes).slice(0, 5)} (fim do mês)`} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receitas" value={t.receitas} icon={ArrowUpCircle} tone="green" href="/receitas" sub={<>recebido <Money value={t.recebido} /></>} />
        <Stat label="Despesas" value={t.despesas} icon={ArrowDownCircle} tone="red" href="/despesas" sub={<>pago ou no cartão <Money value={t.pago} /></>} />
        <Stat label="Resultado do período" value={t.saldo} icon={Scale} tone={t.saldo >= 0 ? "green" : "red"} sub="receitas − despesas" />
        <Stat label="A pagar no período" value={toPay} icon={Receipt} tone="amber" href="/a-pagar" sub="contas e faturas" />
        <Stat label="A receber no período" value={toReceive} icon={PiggyBank} tone="green" href="/a-receber" />
        <Stat label="Vencidas" value={sum(overdue.map((o) => o.amount))} icon={AlertTriangle} tone="red" href="/a-pagar" sub={`${overdue.length} em atraso`} />
        <Stat label="Próximos 30 dias" value={sum(future.map((f) => f.amount))} icon={CalendarClock} tone="amber" href="/calendario" sub="despesas futuras" />
        <Stat label="Limite disponível" value={sum(usages.map((u) => u.available))} icon={CreditCard} tone="violet" href="/cartoes" sub={`de ${cards.length} cartões`} />
        <Stat label="Faturas em aberto" value={sum(openInvoices.map((i) => i.remaining))} icon={CreditCard} tone="violet" href="/cartoes" sub={`${openInvoices.length} faturas`} />
        <Stat label="Total das dívidas" value={loanDebt + cardDebt} icon={Landmark} tone="red" href="/dividas" sub={<>empréstimos <Money value={loanDebt} /></>} />
        <div className="col-span-2 lg:col-span-1">
          <Stat label="Patrimônio" value={worth.at(-1)?.patrimonio ?? 0} icon={TrendingUp} href="/relatorios" sub="contas − dívidas" />
        </div>
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
          <CardTitle action={<Link href="/a-pagar" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400">Ver tudo</Link>}>Próximos vencimentos</CardTitle>
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
              <CardTitle action={<Link href="/planejamento" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400">Orçamento</Link>}>Alertas de orçamento</CardTitle>
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
              <Link href="/inteligencia" className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">Abrir</Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
