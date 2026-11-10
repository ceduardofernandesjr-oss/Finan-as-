"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownCircle, ArrowDownRight, ArrowUpCircle, ArrowUpRight, CalendarClock, CreditCard, Eye, EyeOff,
  Landmark, PiggyBank, Receipt, Scale, TrendingUp, Wallet,
} from "lucide-react";
import { useFinance } from "@/lib/store";
import { addDays, addMonths, formatBR, monthEnd, monthKey, monthLabel, monthRange, monthStart, parts, periodRange } from "@/lib/finance/dates";
import { cardUsage } from "@/lib/finance/cards";
import { loanStatus } from "@/lib/finance/loans";
import { allInvoices, budgetStatus, byCategory, cashFlow, entriesIn, netWorthSeries, pendingCommitments, resultByMonth } from "@/lib/finance/reports";
import { balanceSummary, dueSoon, forecastBalance, pendingSummary, periodSummary, type BalanceSummary, type DueItem } from "@/lib/finance/dashboard";
import { analyze } from "@/lib/finance/insights";
import { formatMoney, sum } from "@/lib/finance/money";
import { PageHeader } from "@/components/shell";
import { PeriodBar, usePeriod } from "@/components/tx-list";
import { Badge, Button, Card, CardTitle, EmptyState, Money, Progress, Skeleton, cx } from "@/components/ui";
import { AreaMoneyChart, C, CashFlowChart, CategoryDonut, HorizontalBars, IncomeExpenseChart, LineMoneyChart } from "@/components/charts";
import { useForms } from "@/components/forms/provider";
import { InsightCard } from "@/components/insight-card";

type Tone = "navy" | "green" | "red" | "amber" | "violet";
const TONES: Record<Tone, string> = {
  navy: "bg-slate-100 text-slate-700 ring-slate-200/80 dark:bg-white/[0.06] dark:text-slate-200 dark:ring-white/10",
  green: "bg-brand-50 text-brand-700 ring-brand-200/80 dark:bg-brand-400/10 dark:text-brand-400 dark:ring-brand-400/20",
  red: "bg-rose-50 text-rose-600 ring-rose-200/80 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-200/80 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20",
};

function IconTile({ icon: Icon, tone, className }: { icon: typeof Wallet; tone: Tone; className?: string }) {
  return (
    <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition group-hover:scale-105", TONES[tone], className)}>
      <Icon className="size-4" strokeWidth={2.1} />
    </span>
  );
}

function CardLink({ href, children }: { href?: string; children: React.ReactNode }) {
  return href ? (
    <Link href={href} className="block h-full rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400">
      {children}
    </Link>
  ) : (
    <>{children}</>
  );
}

/** Indicador secundário (compacto). */
function Stat({
  label, value, icon, tone = "navy", sub, href,
}: { label: string; value: number; icon: typeof Wallet; tone?: Tone; sub?: React.ReactNode; href?: string }) {
  return (
    <CardLink href={href}>
      <Card className="group h-full p-4 transition duration-200 hover:-translate-y-0.5 hover:ring-slate-300 sm:p-4 dark:hover:ring-white/15">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
          <IconTile icon={icon} tone={tone} />
        </div>
        <Money value={value} className="mt-2 block text-xl font-semibold" />
        {sub && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{sub}</p>}
      </Card>
    </CardLink>
  );
}

/** Indicador principal do período: valor, variação contra o período anterior e quanto já foi realizado. */
function Kpi({
  label, value, icon, tone, href, variacao, realizado, rodape,
}: {
  label: string;
  value: number;
  icon: typeof Wallet;
  tone: Tone;
  href?: string;
  variacao?: React.ReactNode;
  realizado?: { pct: number; texto: React.ReactNode };
  rodape?: React.ReactNode;
}) {
  return (
    <CardLink href={href}>
      <Card className="group flex h-full flex-col p-4 transition duration-200 hover:-translate-y-0.5 hover:ring-slate-300 sm:p-5 dark:hover:ring-white/15">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500 sm:text-[13px] dark:text-slate-400">{label}</span>
          <IconTile icon={icon} tone={tone} className="sm:size-9" />
        </div>
        <Money value={value} className={cx("mt-2 block text-xl font-semibold tracking-tight sm:text-2xl", value < 0 && "text-rose-600 dark:text-rose-400")} />
        {variacao && <div className="mt-1.5">{variacao}</div>}
        {realizado && (
          <div className="mt-auto pt-3">
            <Progress value={realizado.pct} tone={tone === "red" ? "red" : "green"} />
            <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{realizado.texto}</p>
          </div>
        )}
        {rodape && <div className={cx("text-[11px] leading-snug text-slate-500 dark:text-slate-400", realizado ? "mt-1" : "mt-auto pt-3")}>{rodape}</div>}
      </Card>
    </CardLink>
  );
}

function pctTexto(p: number): string {
  const a = Math.abs(p);
  if (a >= 1000) return ">999%";
  return `${a < 10 ? a.toFixed(1).replace(".", ",") : Math.round(a)}%`;
}

/** Variação percentual com cor pelo sentido bom/ruim. Sem base anterior, diz isso em vez de inventar um número. */
function Variacao({ pct, atual, melhorSubir, vs }: { pct: number | null; atual: number; melhorSubir: boolean; vs: string }) {
  if (pct === null) {
    return atual ? <span className="text-[11px] text-slate-500 dark:text-slate-400">sem lançamentos em {vs}</span> : null;
  }
  if (Math.abs(pct) < 0.5) return <span className="text-[11px] text-slate-500 dark:text-slate-400">igual a {vs}</span>;
  const sobe = pct > 0;
  const bom = sobe === melhorSubir;
  const Icon = sobe ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[11px]">
      <span
        className={cx(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
          bom ? "bg-brand-50 text-brand-700 dark:bg-brand-400/10 dark:text-brand-400" : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
        )}
      >
        <Icon className="size-3" strokeWidth={2.6} aria-hidden />
        <span className="sr-only">{sobe ? "aumento de" : "queda de"}</span>
        {pctTexto(pct)}
      </span>
      <span className="text-slate-500 dark:text-slate-400">vs {vs}</span>
    </span>
  );
}

function VariacaoValor({ diff, vs, temBase }: { diff: number; vs: string; temBase: boolean }) {
  if (!temBase) return null;
  if (!diff) return <span className="text-[11px] text-slate-500 dark:text-slate-400">igual a {vs}</span>;
  const bom = diff > 0;
  const Icon = bom ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[11px]">
      <span
        className={cx(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
          bom ? "bg-brand-50 text-brand-700 dark:bg-brand-400/10 dark:text-brand-400" : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
        )}
      >
        <Icon className="size-3" strokeWidth={2.6} aria-hidden />
        <span className="money">{formatMoney(Math.abs(diff))}</span>
      </span>
      <span className="text-slate-500 dark:text-slate-400">{bom ? "melhor" : "pior"} que {vs}</span>
    </span>
  );
}

/** Mostrar/ocultar valores de saldo (a escolha fica guardada neste aparelho). */
const CHAVE_OCULTAR = "financas.ocultarSaldo";
const OCULTO = "R$ ••••••";

function useOcultarSaldo() {
  const [oculto, setOculto] = useState(false);
  useEffect(() => {
    try { setOculto(localStorage.getItem(CHAVE_OCULTAR) === "1"); } catch { /* armazenamento bloqueado */ }
  }, []);
  const alternar = () =>
    setOculto((v) => {
      try { localStorage.setItem(CHAVE_OCULTAR, v ? "0" : "1"); } catch { /* armazenamento bloqueado */ }
      return !v;
    });
  return { oculto, alternar, valor: (c: number) => (oculto ? OCULTO : formatMoney(c)) };
}

/** Destaque do topo: saldo disponível, saldo de cada conta, consolidado, patrimônio líquido e previsão. */
function SaldoDestaque({ s, previsto, ate, ocultar }: { s: BalanceSummary; previsto: number | null; ate: string; ocultar: ReturnType<typeof useOcultarSaldo> }) {
  const { oculto, alternar, valor } = ocultar;
  const tiles: { label: string; value: number; hint: string; href?: string; destaque?: boolean }[] = [];
  if (s.temInvestimentos)
    tiles.push({ label: "Saldo consolidado", value: s.consolidado, hint: `inclui ${valor(s.investido)} investidos`, href: "/contas" });
  tiles.push({
    label: "Patrimônio líquido",
    value: s.patrimonio,
    hint: s.dividas ? `${valor(s.ativos)} em contas − ${valor(s.dividas)} em dívidas` : "contas, sem dívidas registradas",
    href: "/relatorios",
  });
  if (previsto !== null) tiles.push({ label: `Previsto em ${ate}`, value: previsto, hint: "saldo disponível no fim do mês", destaque: true });

  return (
    <Card className="relative mb-5 overflow-hidden !bg-navy-950 p-5 text-white !ring-white/[0.06] sm:p-7 dark:!bg-navy-900 dark:!ring-brand-400/15">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-brand-400/25 blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 right-24 size-64 rounded-full bg-brand-400/10 blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.06)_1px,transparent_1px)] bg-[size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent_60%)]" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
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
          <p className={cx("money mt-3 text-4xl font-semibold sm:text-5xl", !oculto && s.disponivel < 0 && "text-rose-300")} aria-live="polite">{valor(s.disponivel)}</p>
          <p className="mt-2 text-xs text-slate-400">
            {s.temInvestimentos ? "Em contas, carteiras e dinheiro, sem os investimentos" : "Soma das suas contas ativas hoje"}
          </p>
        </div>
        <Link href="/contas" className="rounded-xl bg-white/[0.08] px-3.5 py-2 text-sm font-medium ring-1 ring-white/10 transition hover:bg-brand-400 hover:text-navy-950 hover:ring-brand-400 active:scale-95">Ver contas</Link>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t, i) => {
          const corpo = (
            <div className={cx("h-full rounded-2xl p-3 ring-1 transition", t.destaque ? "bg-brand-400/[0.08] ring-brand-400/25" : "bg-white/[0.05] ring-white/10", t.href && "hover:bg-white/[0.1]")}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t.label}</p>
              <p className={cx("money mt-1 text-lg font-semibold sm:text-xl", !oculto && t.value < 0 ? "text-rose-300" : t.destaque ? "text-brand-400" : "text-white")}>{valor(t.value)}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{t.hint}</p>
            </div>
          );
          const span = tiles.length === 3 && i === 2 ? "col-span-2 sm:col-span-1" : tiles.length === 1 ? "col-span-2 sm:col-span-1" : "";
          return (
            <div key={t.label} className={span}>
              {t.href ? <Link href={t.href} className="block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-brand-400">{corpo}</Link> : corpo}
            </div>
          );
        })}
      </div>

      {s.contas.length > 0 && (
        <ul className="relative mt-4 flex flex-wrap gap-2">
          {s.contas.map((a) => (
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

/** Previsão do saldo disponível, dia a dia, até o fim do mês. */
function Previsao({
  f, ate, ocultar,
}: { f: ReturnType<typeof forecastBalance>; ate: string; ocultar: ReturnType<typeof useOcultarSaldo> }) {
  const { oculto, valor } = ocultar;
  const serie = f.series.map((p) => ({ label: formatBR(p.date).slice(0, 5), previsto: p.saldo }));
  const fica = f.min.saldo < 0;
  const numeros = [
    { label: "Hoje", value: valor(f.start), cls: "" },
    { label: "Entradas previstas", value: oculto ? OCULTO : `+ ${formatMoney(f.entradas)}`, cls: "text-brand-700 dark:text-brand-400" },
    { label: "Saídas previstas", value: oculto ? OCULTO : `− ${formatMoney(f.saidas)}`, cls: "text-rose-600 dark:text-rose-400" },
    { label: `Em ${ate}`, value: valor(f.end), cls: !oculto && f.end < 0 ? "text-rose-600 dark:text-rose-400" : "" },
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
        {numeros.map((n) => (
          <div key={n.label} className="min-w-0">
            <dt className="text-[11px] text-slate-500 dark:text-slate-400">{n.label}</dt>
            <dd className={cx("money text-base font-semibold", n.cls)}>{n.value}</dd>
          </div>
        ))}
      </dl>
      {oculto ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">Valores ocultos. Toque no olho do saldo para mostrar.</p>
      ) : (
        <div className="mt-3">
          <AreaMoneyChart data={serie} dataKey="previsto" name="Saldo previsto" height={180} zeroLine={fica} />
        </div>
      )}
      <p className={cx("mt-2 flex items-start gap-1.5 text-xs", fica ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400")}>
        {fica && <AlertTriangle className="mt-px size-3.5 shrink-0" />}
        <span>
          {fica ? "O saldo fica negativo: " : "Menor saldo previsto: "}
          <span className="money font-semibold">{valor(f.min.saldo)}</span> em {formatBR(f.min.date)}.
          {f.atrasadosIncluidos > 0 && ` Inclui ${f.atrasadosIncluidos} ${f.atrasadosIncluidos === 1 ? "pendência atrasada" : "pendências atrasadas"} como se fosse quitada hoje.`}
        </span>
      </p>
    </>
  );
}

function quando(dias: number): string {
  if (dias < 0) return `há ${-dias} ${dias === -1 ? "dia" : "dias"}`;
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

function LinhaVencimento({ c, forms }: { c: DueItem; forms: ReturnType<typeof useForms> }) {
  const receber = c.type === "receita";
  const icon = c.type === "fatura" ? CreditCard : receber ? ArrowUpCircle : ArrowDownCircle;
  const tone: Tone = c.type === "fatura" ? "violet" : receber ? "green" : "red";
  return (
    <li className="flex items-center gap-3 py-2.5">
      <IconTile icon={icon} tone={tone} className="size-9" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{c.description}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          {formatBR(c.date)}
          <Badge tone={c.dias < 0 ? "red" : c.dias <= 1 ? "amber" : "slate"}>{quando(c.dias)}</Badge>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Money value={receber ? c.amount : -c.amount} signed colored className="text-sm font-semibold" />
        {c.tx ? (
          <Button size="sm" variant="secondary" onClick={() => forms.openSettle(c.tx!)}>{receber ? "Receber" : "Pagar"}</Button>
        ) : c.invoice ? (
          <Button size="sm" variant="secondary" onClick={() => forms.openInvoicePay(c.invoice!)}>Pagar</Button>
        ) : null}
      </div>
    </li>
  );
}

function Vencimentos({ due, forms }: { due: ReturnType<typeof dueSoon>; forms: ReturnType<typeof useForms> }) {
  const MAX_ATRASO = 3;
  const atrasados = due.atrasados.slice(0, MAX_ATRASO);
  const resto = due.atrasados.length - atrasados.length;
  const proximos = due.proximos.slice(0, 6);
  if (!due.atrasados.length && !due.proximos.length) return <EmptyState title="Nada vencido nem vencendo nos próximos 7 dias" />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-white/[0.06]">
          A pagar em 7 dias <Money value={due.totalPagarProximos} className="font-semibold" />
        </span>
        {due.totalPagarAtrasado > 0 && (
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            Em atraso <Money value={due.totalPagarAtrasado} className="font-semibold" />
          </span>
        )}
        {due.totalReceberProximos > 0 && (
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700 dark:bg-brand-400/10 dark:text-brand-300">
            A receber <Money value={due.totalReceberProximos} className="font-semibold" />
          </span>
        )}
      </div>
      {atrasados.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">Em atraso</h3>
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {atrasados.map((c) => <LinhaVencimento key={c.id} c={c} forms={forms} />)}
          </ul>
          {resto > 0 && (
            <Link href="/a-pagar" className="text-xs font-medium text-rose-600 hover:underline dark:text-rose-400">
              e mais {resto} em atraso
            </Link>
          )}
        </section>
      )}
      {proximos.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Próximos 7 dias</h3>
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {proximos.map((c) => <LinhaVencimento key={c.id} c={c} forms={forms} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data, entries, today, loading } = useFinance();
  const p = usePeriod("mes");
  const forms = useForms();
  const ocultar = useOcultarSaldo();
  const { from, to } = p.range;

  // todos os números do painel, recalculados só quando os dados, o dia ou o período mudam
  const v = useMemo(() => {
    const prev = periodRange(p.period, today, p.offset - 1);
    const vs =
      p.period === "mes" ? monthLabel(monthKey(prev.from)) : p.period === "ano" ? String(parts(prev.from).y) : p.period === "semana" ? "a semana anterior" : "o trimestre anterior";
    const periodEntries = entriesIn(entries, from, to);
    const resumo = periodSummary(entries, { from, to }, prev);
    const saldos = balanceSummary(data, today);
    const fimMes = monthEnd(today);
    const disponiveis = saldos.contas.filter((a) => a.type !== "investimento").map((a) => a.id);
    const previsao = data.accounts.length
      ? forecastBalance(data, today, fimMes, disponiveis.length ? disponiveis : saldos.contas.map((a) => a.id))
      : null;

    const commitments = pendingCommitments(data, today);
    const receber = pendingSummary(commitments, { from, to }, "receber");
    const pagar = pendingSummary(commitments, { from, to }, "pagar");
    const overdue = commitments.filter((c) => c.overdue && c.type !== "receita");
    const in30 = addDays(today, 30);
    const future = commitments.filter((c) => c.type !== "receita" && c.date > today && c.date <= in30);
    const due = dueSoon(commitments, today, 7);

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
    const prevCats = new Map(byCategory(entriesIn(entries, prev.from, prev.to), data.categories, "despesa").map((c) => [c.id, c.amount]));
    const comparison = cats.slice(0, 6).map((c) => ({ name: c.name, atual: c.amount, anterior: prevCats.get(c.id) ?? 0 }));
    const budgets = budgetStatus(data.budgets, data.categories, entries, monthKey(today)).filter((b) => b.level !== "ok");
    const insights = analyze(data, today, entries).filter((i) => i.tone !== "info").slice(0, 2);

    return {
      vs, resumo, saldos, fimMes, previsao, receber, pagar, overdue, future, due, cards, usages, loanDebt, cardDebt,
      openInvoices, monthly, worth, flow, evolution, cats, comparison, budgets, insights,
    };
  }, [data, entries, today, p.period, p.offset, from, to]);

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-52" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );

  const { resumo, vs } = v;
  const t = resumo.atual;
  const ate = formatBR(v.fimMes).slice(0, 5);
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
            {["Cadastre suas contas e o saldo de hoje.", "Cadastre seus cartões de crédito.", "Lance receitas, despesas e contas fixas."].map((s, i) => (
              <li key={s} className="flex gap-3 rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/[0.08]">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-400 text-xs font-bold text-navy-950">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="relative mt-5 flex flex-wrap gap-2">
            <Button onClick={() => forms.openAccount()}>Cadastrar conta</Button>
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => forms.openCard()}>Cadastrar cartão</Button>
          </div>
        </Card>
      )}

      {!empty && <SaldoDestaque s={v.saldos} previsto={v.previsao ? v.previsao.end : null} ate={ate} ocultar={ocultar} />}

      {/* Resumo do período escolhido */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {p.period === "mes" ? `Resumo de ${p.title.toLowerCase()}` : p.period === "semana" ? `Resumo da semana (${p.title})` : p.period === "trimestre" ? `Resumo do ${p.title}` : `Resumo de ${p.title}`}
        </h2>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">inclui o que ainda está previsto</span>
      </div>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Receitas"
          value={t.receitas}
          icon={ArrowUpCircle}
          tone="green"
          href="/receitas"
          variacao={<Variacao pct={resumo.variacao.receitas} atual={t.receitas} melhorSubir vs={vs} />}
          realizado={t.receitas ? { pct: (t.recebido / t.receitas) * 100, texto: <><Money value={t.recebido} /> recebido</> } : undefined}
        />
        <Kpi
          label="Despesas"
          value={t.despesas}
          icon={ArrowDownCircle}
          tone="red"
          href="/despesas"
          variacao={<Variacao pct={resumo.variacao.despesas} atual={t.despesas} melhorSubir={false} vs={vs} />}
          realizado={t.despesas ? { pct: (t.pago / t.despesas) * 100, texto: <><Money value={t.pago} /> pago ou no cartão</> } : undefined}
        />
        <Kpi
          label="Resultado"
          value={t.saldo}
          icon={Scale}
          tone={t.saldo >= 0 ? "green" : "red"}
          href="/relatorios"
          variacao={<VariacaoValor diff={resumo.variacao.resultado} vs={vs} temBase={!!(resumo.anterior.receitas || resumo.anterior.despesas)} />}
          rodape="receitas − despesas (sem transferências e pagamentos de fatura)"
        />
        <Kpi
          label="A receber"
          value={v.receber.total}
          icon={PiggyBank}
          tone="green"
          href="/a-receber"
          rodape={
            <>
              {v.receber.quantidade ? `${v.receber.quantidade} ${v.receber.quantidade === 1 ? "lançamento pendente" : "lançamentos pendentes"} no período` : "nada pendente no período"}
              {v.receber.emAtraso > 0 && (
                <span className="block text-rose-600 dark:text-rose-400"><Money value={v.receber.emAtraso} /> já venceu</span>
              )}
              {v.receber.atrasadoAntes > 0 && (
                <span className="block text-amber-700 dark:text-amber-300">
                  + <Money value={v.receber.atrasadoAntes} /> em atraso de antes
                </span>
              )}
            </>
          }
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub={`Saldo disponível de hoje até ${ate} com contas, recebimentos e faturas pendentes`}>Previsão até o fim do mês</CardTitle>
          {v.previsao ? <Previsao f={v.previsao} ate={ate} ocultar={ocultar} /> : <EmptyState title="Cadastre suas contas para ver a previsão" />}
        </Card>
        <Card>
          <CardTitle sub="Em atraso e nos próximos 7 dias" action={<Link href="/a-pagar" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400">Ver tudo</Link>}>
            Vencimentos
          </CardTitle>
          <Vencimentos due={v.due} forms={forms} />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub={p.period === "ano" ? "Por mês do ano" : "Últimos 6 meses, por mês"}>Receitas x despesas</CardTitle>
          {v.monthly.some((m) => m.receitas || m.despesas) ? <IncomeExpenseChart data={v.monthly} /> : <EmptyState title="Sem lançamentos nesses meses" />}
        </Card>
        <Card>
          <CardTitle sub={`${p.title} · compras no cartão incluídas`}>Gastos por categoria</CardTitle>
          {v.cats.length ? <CategoryDonut data={v.cats} /> : <EmptyState title="Nenhuma despesa no período" />}
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-[15px] font-semibold tracking-tight">Compromissos e crédito</h2>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="A pagar no período" value={v.pagar.total} icon={Receipt} tone="amber" href="/a-pagar" sub="contas e faturas" />
        <Stat label="Vencidas" value={sum(v.overdue.map((o) => o.amount))} icon={AlertTriangle} tone="red" href="/a-pagar" sub={`${v.overdue.length} em atraso`} />
        <Stat label="Próximos 30 dias" value={sum(v.future.map((f) => f.amount))} icon={CalendarClock} tone="amber" href="/calendario" sub="despesas futuras" />
        <Stat label="Limite disponível" value={sum(v.usages.map((u) => u.available))} icon={CreditCard} tone="violet" href="/cartoes" sub={`de ${v.cards.length} cartões`} />
        <Stat label="Faturas em aberto" value={sum(v.openInvoices.map((i) => i.remaining))} icon={CreditCard} tone="violet" href="/cartoes" sub={`${v.openInvoices.length} faturas`} />
        <Stat label="Total das dívidas" value={v.loanDebt + v.cardDebt} icon={Landmark} tone="red" href="/dividas" sub={<>empréstimos <Money value={v.loanDebt} /></>} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardTitle sub="Últimos 12 meses: contas − cartões − empréstimos" action={<TrendingUp className="size-4 text-slate-400" aria-hidden />}>Evolução do patrimônio</CardTitle>
          <LineMoneyChart data={v.worth} lines={[{ key: "patrimonio", name: "Patrimônio", color: C.navy }, { key: "dividas", name: "Dívidas", color: C.expense, dashed: true }]} />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle sub="Dinheiro que entrou e saiu das contas (faturas incluídas, transferências não)">Fluxo de caixa</CardTitle>
          <CashFlowChart data={v.flow} />
        </Card>
        <Card>
          <CardTitle sub="Receitas − despesas de cada mês, últimos 12 meses">Evolução financeira mensal</CardTitle>
          <AreaMoneyChart data={v.evolution} dataKey="saldo" name="Saldo do mês" zeroLine />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle sub="Maiores categorias do período contra o período anterior">Comparativo entre períodos</CardTitle>
          {v.comparison.length ? <HorizontalBars data={v.comparison} /> : <EmptyState title="Sem despesas para comparar" />}
        </Card>
        <div className="space-y-5">
          {v.budgets.length > 0 && (
            <Card>
              <CardTitle action={<Link href="/planejamento" className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-400">Orçamento</Link>}>Alertas de orçamento</CardTitle>
              <ul className="space-y-3">
                {v.budgets.slice(0, 4).map((b) => (
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
          {v.insights.map((i) => (
            <InsightCard key={i.id} insight={i} compact />
          ))}
          {!v.budgets.length && !v.insights.length && (
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
