"use client";
// Tela Início: leitura rápida, de cima para baixo — saldo, patrimônio e previsão, receitas e despesas,
// gráficos (em abas), contas e últimas movimentações. Todos os números vêm de lib/finance (testados).
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownCircle, ArrowDownLeft, ArrowDownRight, ArrowUpCircle, ArrowUpRight, CalendarClock, ChevronDown, ChevronRight, CreditCard,
  Eye, EyeOff, Landmark, Wallet,
} from "lucide-react";
import { useFinance } from "@/lib/store";
import { addDays, addMonths, formatBR, monthEnd, monthKey, monthLabel, monthRange, monthStart, parts, periodRange } from "@/lib/finance/dates";
import { cardUsage } from "@/lib/finance/cards";
import { loanStatus } from "@/lib/finance/loans";
import { allInvoices, budgetStatus, byCategory, cashFlow, entriesIn, netWorthSeries, pendingCommitments, resultByMonth } from "@/lib/finance/reports";
import { balanceSummary, dueSoon, forecastBalance, pendingSummary, periodSummary, type DueItem } from "@/lib/finance/dashboard";
import { analyze } from "@/lib/finance/insights";
import { formatMoney, sum } from "@/lib/finance/money";
import { ACCOUNT_TYPE_LABEL } from "@/lib/types";
import { PeriodBar, usePeriod } from "@/components/tx-list";
import { Badge, Button, EmptyState, Money, Progress, Segmented, Skeleton, cx } from "@/components/ui";
import { AreaMoneyChart, C, CashFlowChart, CategoryDonut, FluxoChart, HorizontalBars, LineMoneyChart } from "@/components/charts";
import { CategoryIcon } from "@/components/category-icon";
import { useForms } from "@/components/forms/provider";
import { InsightCard } from "@/components/insight-card";

type Tone = "navy" | "green" | "red" | "amber" | "violet";
const TONES: Record<Tone, string> = {
  navy: "bg-slate-100 text-slate-700 dark:bg-tint/[0.06] dark:text-slate-200",
  green: "bg-brand-50 text-brand-700 dark:bg-brand-400/10 dark:text-brand-400",
  red: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300",
};

function IconTile({ icon: Icon, tone, className }: { icon: typeof Wallet; tone: Tone; className?: string }) {
  return (
    <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-xl", TONES[tone], className)}>
      <Icon className="size-4" strokeWidth={2.1} />
    </span>
  );
}

/** Superfície única do painel: cinza-escuro, sem borda no escuro (sem cartão dentro de cartão). */
function Superficie({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={cx("rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-slate-200/70 sm:p-5 dark:bg-navy-900 dark:shadow-[var(--shadow-card-dark)] dark:ring-line/50", className)}>
      {children}
    </section>
  );
}

function Titulo({ children, acao, sub }: { children: React.ReactNode; acao?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[19px] font-semibold leading-tight tracking-tight">{children}</h2>
        {sub && <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {acao}
    </div>
  );
}

function LinkSecao({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-mr-1.5 flex min-h-9 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-[13px] font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
      {children} <ChevronRight className="size-3.5" />
    </Link>
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
    return atual ? <span className="text-xs text-slate-500 dark:text-slate-400">sem lançamentos em {vs}</span> : null;
  }
  if (Math.abs(pct) < 0.5) return <span className="text-xs text-slate-500 dark:text-slate-400">igual a {vs}</span>;
  const sobe = pct > 0;
  const bom = sobe === melhorSubir;
  const Icon = sobe ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
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
  if (!diff) return <span className="text-xs text-slate-500 dark:text-slate-400">igual a {vs}</span>;
  const bom = diff > 0;
  const Icon = bom ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
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
            <dt className="text-xs text-slate-500 dark:text-slate-400">{n.label}</dt>
            <dd className={cx("money text-base font-semibold", n.cls)}>{n.value}</dd>
          </div>
        ))}
      </dl>
      {oculto ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-tint/[0.03] dark:text-slate-400">Valores ocultos. Toque no olho do saldo para mostrar.</p>
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
        <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-tint/[0.06]">
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">Em atraso</h3>
          <ul className="divide-y divide-slate-100 dark:divide-line/70">
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Próximos 7 dias</h3>
          <ul className="divide-y divide-slate-100 dark:divide-line/70">
            {proximos.map((c) => <LinhaVencimento key={c.id} c={c} forms={forms} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Transição suave de valores (quando o saldo muda ou carrega). Respeita "reduzir movimento". */
function useValorAnimado(alvo: number): number {
  const [v, setV] = useState(alvo);
  const de = useRef(alvo);
  useEffect(() => {
    const ini = de.current;
    if (ini === alvo || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      de.current = alvo;
      setV(alvo);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      const e = 1 - Math.pow(1 - k, 3);
      const atual = Math.round(ini + (alvo - ini) * e);
      setV(atual);
      de.current = atual;
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo]);
  return v;
}

/** Componente principal: saldo disponível, com olho para ocultar e acesso às contas. */
function Saldo({ s, ocultar }: { s: ReturnType<typeof balanceSummary>; ocultar: ReturnType<typeof useOcultarSaldo> }) {
  const { oculto, alternar, valor } = ocultar;
  const animado = useValorAnimado(s.disponivel);
  return (
    <section aria-label="Saldo disponível" className="relative overflow-hidden rounded-[var(--radius-card)] bg-navy-950 px-5 pb-4 pt-4 text-slate-50 shadow-[var(--shadow-card-dark)] ring-1 ring-line dark:bg-navy-900 sm:px-6 sm:pt-5">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/40 to-transparent" />
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-medium text-slate-400">
          <Wallet className="size-4 text-brand-400" strokeWidth={2.2} />
          Saldo disponível
        </p>
        <button
          type="button"
          onClick={alternar}
          aria-label={oculto ? "Mostrar saldo" : "Ocultar saldo"}
          aria-pressed={oculto}
          title={oculto ? "Mostrar saldo" : "Ocultar saldo"}
          className="-mr-2 flex size-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white active:scale-90 focus-visible:outline-2 focus-visible:outline-brand-400"
        >
          {oculto ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      </div>
      <p className={cx("money mt-1 text-[36px] font-bold leading-[1.1] tracking-tight sm:text-[42px]", !oculto && s.disponivel < 0 && "text-rose-300")} aria-live="polite">
        {oculto ? valor(s.disponivel) : formatMoney(animado)}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="min-w-0 text-[13px] text-slate-400">
          {s.temInvestimentos ? (
            <>
              Consolidado <span className="money font-medium text-slate-200">{valor(s.consolidado)}</span> · inclui {valor(s.investido)} investidos
            </>
          ) : (
            `Em ${s.contas.length} ${s.contas.length === 1 ? "conta ativa" : "contas ativas"}, hoje`
          )}
        </p>
        <Link href="/contas" className="flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-white/[0.07] px-3 text-[13px] font-medium text-slate-100 transition hover:bg-white/[0.12] active:scale-95">
          Contas <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}

/** Metade do bloco de indicadores (patrimônio líquido / fechamento previsto). */
function Indicador({ label, valor, negativo, hint, href }: { label: string; valor: string; negativo: boolean; hint: string; href?: string }) {
  const corpo = (
    <div className="h-full min-w-0 px-4 py-3.5 sm:px-5">
      <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cx("money mt-1 text-[19px] font-bold tracking-tight", negativo && "text-rose-600 dark:text-rose-400")}>{valor}</p>
      <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
  return href ? <Link href={href} className="block h-full transition hover:bg-slate-50 dark:hover:bg-tint/[0.02]">{corpo}</Link> : corpo;
}

/** Card de receitas ou despesas: ícone de entrada/saída, total e comparação com o período anterior. */
function CardFluxo({ tipo, valor, pct, vs, realizado, href }: { tipo: "receita" | "despesa"; valor: number; pct: number | null; vs: string; realizado: number; href: string }) {
  const entrada = tipo === "receita";
  const Icone = entrada ? ArrowDownLeft : ArrowUpRight;
  return (
    <Link href={href} aria-label={entrada ? "Receitas" : "Despesas"} className="group block min-w-0 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-slate-200/70 transition active:scale-[0.98] dark:bg-navy-900 dark:shadow-[var(--shadow-card-dark)] dark:ring-line/50 dark:hover:bg-navy-850">
      <div className="flex items-center gap-2">
        <span className={cx("flex size-8 items-center justify-center rounded-xl", entrada ? "bg-brand-50 text-brand-700 dark:bg-brand-400/12 dark:text-brand-400" : "bg-rose-50 text-rose-600 dark:bg-rose-400/12 dark:text-rose-400")}>
          <Icone className="size-[18px]" strokeWidth={2.3} />
        </span>
        <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{entrada ? "Receitas" : "Despesas"}</span>
      </div>
      <Money value={valor} className="mt-2.5 block text-[21px] font-bold tracking-tight" />
      <div className="mt-1 min-h-5"><Variacao pct={pct} atual={valor} melhorSubir={entrada} vs={vs} /></div>
      {valor > 0 && (
        <div className="mt-2.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-tint/[0.06]">
            <div className={cx("h-full rounded-full transition-[width] duration-700", entrada ? "bg-brand-500 dark:bg-brand-400" : "bg-rose-500 dark:bg-rose-400")} style={{ width: `${Math.min(100, (realizado / valor) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"><Money value={realizado} /> {entrada ? "recebido" : "pago ou no cartão"}</p>
        </div>
      )}
    </Link>
  );
}

/** Identificação visual da conta: iniciais na cor da conta. */
function AvatarConta({ nome, cor }: { nome: string; cor: string }) {
  const ini = nome.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const h = cor.replace("#", "");
  const hex = /^[0-9a-f]{6}$/i.test(h) ? h : /^[0-9a-f]{3}$/i.test(h) ? h.split("").map((c) => c + c).join("") : "70766d";
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const claro = 0.299 * r + 0.587 * g + 0.114 * b > 150;
  return (
    <span aria-hidden className={cx("flex size-10 shrink-0 items-center justify-center rounded-[12px] text-[13px] font-bold", claro ? "text-navy-950" : "text-white")} style={{ background: `#${hex}` }}>
      {ini}
    </span>
  );
}

/** Linha da lista "mais indicadores". */
function LinhaIndicador({ label, value, sub, href, tone = "navy", icon }: { label: string; value: number; sub?: React.ReactNode; href: string; tone?: Tone; icon: typeof Wallet }) {
  return (
    <li>
      <Link href={href} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-tint/[0.03]">
        <IconTile icon={icon} tone={tone} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">{label}</p>
          {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
        <Money value={value} className="text-sm font-semibold" />
      </Link>
    </li>
  );
}


type Aba = "fluxo" | "previsao" | "categorias" | "patrimonio" | "caixa" | "evolucao" | "comparativo";

export default function Dashboard() {
  const { data, entries, today, loading } = useFinance();
  const p = usePeriod("mes");
  const forms = useForms();
  const ocultar = useOcultarSaldo();
  const { from, to } = p.range;
  const [maisIndicadores, setMaisIndicadores] = useState(false);
  const [vencAberto, setVencAberto] = useState(false);
  const [aba, setAba] = useState<Aba>("fluxo");
  const [todasContas, setTodasContas] = useState(false);

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
    // últimas movimentações: o que já aconteceu (pago, recebido ou comprado no cartão), mais recente primeiro
    const ultimas = entries
      .filter((e) => e.settled && e.date <= today)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 6);

    return {
      vs, resumo, saldos, fimMes, previsao, receber, pagar, overdue, future, due, cards, usages, loanDebt, cardDebt,
      openInvoices, monthly, worth, flow, evolution, cats, comparison, budgets, insights, ultimas,
    };
  }, [data, entries, today, p.period, p.offset, from, to]);

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-28" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );

  const { resumo, vs } = v;
  const t = resumo.atual;
  const ate = formatBR(v.fimMes).slice(0, 5);
  const empty = !data.accounts.length && !data.transactions.length && !data.cards.length;
  const { valor, oculto } = ocultar;
  const s = v.saldos;
  const catPorId = new Map(data.categories.map((c) => [c.id, c]));
  const temVenc = v.due.atrasados.length > 0 || v.due.proximos.length > 0;
  const tituloPeriodo = p.period === "mes" ? p.title.toLowerCase() : p.period === "semana" ? `a semana (${p.title})` : p.period === "trimestre" ? `o ${p.title}` : p.title;

  const abas: { value: Aba; label: string; sub: string }[] = [
    { value: "fluxo", label: "Fluxo", sub: p.period === "ano" ? "Receitas, despesas e saldo líquido por mês do ano" : "Receitas, despesas e saldo líquido dos últimos 6 meses" },
    { value: "previsao", label: "Previsão", sub: `Saldo disponível de hoje até ${ate} com contas, recebimentos e faturas pendentes` },
    { value: "categorias", label: "Categorias", sub: `Gastos de ${tituloPeriodo} · compras no cartão incluídas` },
    { value: "patrimonio", label: "Patrimônio", sub: "Últimos 12 meses: contas − cartões − empréstimos" },
    { value: "caixa", label: "Fluxo de caixa", sub: "Dinheiro que entrou e saiu das contas (faturas incluídas, transferências não)" },
    { value: "evolucao", label: "Mensal", sub: "Receitas − despesas de cada mês, últimos 12 meses" },
    { value: "comparativo", label: "Comparativo", sub: "Maiores categorias contra o período anterior" },
  ];
  const abaAtual = abas.find((a) => a.value === aba)!;

  return (
    <>
      <h1 className="sr-only">Visão geral</h1>
      <div className="mb-4">
        <PeriodBar p={p} compact />
      </div>

      {empty && (
        <section className="mb-4 rounded-[22px] bg-navy-950 p-5 text-white ring-1 ring-white/[0.06] dark:bg-navy-900 dark:ring-0">
          <p className="text-lg font-semibold tracking-tight">Vamos começar?</p>
          <p className="mt-1 text-sm text-slate-400">Três passos e seu painel ganha vida:</p>
          <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            {["Cadastre suas contas e o saldo de hoje.", "Cadastre seus cartões de crédito.", "Lance receitas, despesas e contas fixas."].map((x, i) => (
              <li key={x} className="flex gap-3 rounded-2xl bg-white/[0.05] p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-400 text-xs font-bold text-navy-950">{i + 1}</span>
                {x}
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => forms.openAccount()}>Cadastrar conta</Button>
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => forms.openCard()}>Cadastrar cartão</Button>
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-6">
        {/* coluna principal */}
        <div className="stagger min-w-0 space-y-5 lg:space-y-6">
          {!empty && <Saldo s={s} ocultar={ocultar} />}

          {!empty && (
            <section aria-label="Indicadores" className="grid grid-cols-2 divide-x divide-slate-100 overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] ring-1 ring-slate-200/70 dark:divide-line dark:bg-navy-900 dark:shadow-[var(--shadow-card-dark)] dark:ring-line/50">
              <Indicador
                label="Patrimônio líquido"
                valor={valor(s.patrimonio)}
                negativo={!oculto && s.patrimonio < 0}
                hint={s.dividas ? `${valor(s.ativos)} em contas − ${valor(s.dividas)} em dívidas` : "contas, sem dívidas registradas"}
                href="/relatorios"
              />
              {v.previsao ? (
                <Indicador label="Fechamento previsto" valor={valor(v.previsao.end)} negativo={!oculto && v.previsao.end < 0} hint={`saldo disponível em ${ate}`} />
              ) : (
                <Indicador label="Fechamento previsto" valor="—" negativo={false} hint="cadastre uma conta" />
              )}
            </section>
          )}

          {/* receitas e despesas do período */}
          <div>
            <div className="mb-2.5 flex items-baseline justify-between gap-2 px-1">
              <h2 className="text-[19px] font-semibold tracking-tight">Resumo do período</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">inclui previstos</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CardFluxo tipo="receita" valor={t.receitas} pct={resumo.variacao.receitas} vs={vs} realizado={t.recebido} href="/receitas" />
              <CardFluxo tipo="despesa" valor={t.despesas} pct={resumo.variacao.despesas} vs={vs} realizado={t.pago} href="/despesas" />
            </div>
          </div>

          <Superficie label="Resultado e pendências" className="!pt-4">
            <div className="grid grid-cols-2 gap-4">
              <Link href="/relatorios" aria-label="Resultado" className="min-w-0 rounded-xl">
                <p className="text-[13px] text-slate-500 dark:text-slate-400">Resultado</p>
                <Money value={t.saldo} signed colored className="mt-0.5 block text-[17px] font-bold" />
                <div className="mt-0.5"><VariacaoValor diff={resumo.variacao.resultado} vs={vs} temBase={!!(resumo.anterior.receitas || resumo.anterior.despesas)} /></div>
              </Link>
              <Link href="/a-receber" aria-label="A receber" className="min-w-0 rounded-xl">
                <p className="text-[13px] text-slate-500 dark:text-slate-400">A receber</p>
                <Money value={v.receber.total} className="mt-0.5 block text-[17px] font-bold" />
                <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
                  {v.receber.quantidade ? `${v.receber.quantidade} ${v.receber.quantidade === 1 ? "pendente" : "pendentes"}` : "nada pendente"}
                  {v.receber.emAtraso > 0 && <span className="block text-rose-600 dark:text-rose-400"><Money value={v.receber.emAtraso} /> já venceu</span>}
                  {v.receber.atrasadoAntes > 0 && <span className="block text-amber-700 dark:text-amber-300">+ <Money value={v.receber.atrasadoAntes} /> em atraso de antes</span>}
                </p>
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setMaisIndicadores((x) => !x)}
              aria-expanded={maisIndicadores}
              className="-mb-1 mt-3 flex min-h-10 w-full items-center justify-center gap-1 rounded-xl border-t border-slate-100 pt-2 text-[13px] font-medium dark:border-line text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              {maisIndicadores ? "Menos indicadores" : "Mais indicadores"}
              <ChevronDown className={cx("size-3.5 transition-transform", maisIndicadores && "rotate-180")} />
            </button>
            {maisIndicadores && (
              <ul className="mt-2 animate-in border-t border-slate-100 pt-2 dark:border-line/70">
                <LinhaIndicador label="A pagar no período" value={v.pagar.total} sub="contas e faturas" href="/a-pagar" tone="amber" icon={ArrowDownCircle} />
                <LinhaIndicador label="Vencidas" value={sum(v.overdue.map((o) => o.amount))} sub={`${v.overdue.length} em atraso`} href="/a-pagar" tone="red" icon={AlertTriangle} />
                <LinhaIndicador label="Próximos 30 dias" value={sum(v.future.map((f) => f.amount))} sub="despesas futuras" href="/calendario" tone="amber" icon={CalendarClock} />
                <LinhaIndicador label="Limite disponível" value={sum(v.usages.map((u) => u.available))} sub={`de ${v.cards.length} cartões`} href="/cartoes" tone="violet" icon={CreditCard} />
                <LinhaIndicador label="Faturas em aberto" value={sum(v.openInvoices.map((i) => i.remaining))} sub={`${v.openInvoices.length} faturas`} href="/cartoes" tone="violet" icon={CreditCard} />
                <LinhaIndicador label="Total das dívidas" value={v.loanDebt + v.cardDebt} sub={<>empréstimos <Money value={v.loanDebt} /></>} href="/dividas" tone="red" icon={Landmark} />
              </ul>
            )}
          </Superficie>

          {/* vencimentos: só quando há algo vencido ou vencendo */}
          {temVenc && (
            <Superficie label="Vencimentos" className="!py-3">
              <button type="button" onClick={() => setVencAberto((x) => !x)} aria-expanded={vencAberto} className="flex w-full items-center gap-3 text-left">
                <IconTile icon={v.due.atrasados.length ? AlertTriangle : CalendarClock} tone={v.due.atrasados.length ? "red" : "amber"} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Vencimentos</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {v.due.atrasados.length > 0 && <span className="text-rose-600 dark:text-rose-400">{v.due.atrasados.length} em atraso</span>}
                    {v.due.atrasados.length > 0 && v.due.proximos.length > 0 && " · "}
                    {v.due.proximos.length > 0 && `${v.due.proximos.length} nos próximos 7 dias`}
                  </p>
                </div>
                <ChevronDown className={cx("size-4 shrink-0 text-slate-400 transition-transform", vencAberto && "rotate-180")} />
              </button>
              {vencAberto && (
                <div className="mt-3 animate-in border-t border-slate-100 pt-3 dark:border-line/70">
                  <Vencimentos due={v.due} forms={forms} />
                  <div className="mt-2 flex justify-end"><LinkSecao href="/a-pagar">Ver tudo</LinkSecao></div>
                </div>
              )}
            </Superficie>
          )}

          {/* fluxo financeiro: todos os gráficos em abas */}
          <Superficie label="Fluxo financeiro">
            <Titulo sub={abaAtual.sub}>Fluxo financeiro</Titulo>
            <Segmented value={aba} onChange={setAba} options={abas.map((a) => ({ value: a.value, label: a.label }))} className="mb-4 w-full !rounded-xl" sutil />
            {aba === "fluxo" && (v.monthly.some((m) => m.receitas || m.despesas) ? <FluxoChart data={v.monthly} /> : <EmptyState title="Sem lançamentos nesses meses" />)}
            {aba === "previsao" && (v.previsao ? <Previsao f={v.previsao} ate={ate} ocultar={ocultar} /> : <EmptyState title="Cadastre suas contas para ver a previsão" />)}
            {aba === "categorias" && (v.cats.length ? <CategoryDonut data={v.cats} /> : <EmptyState title="Nenhuma despesa no período" />)}
            {aba === "patrimonio" && (
              <LineMoneyChart data={v.worth} lines={[{ key: "patrimonio", name: "Patrimônio", color: C.navy }, { key: "dividas", name: "Dívidas", color: C.expense, dashed: true }]} />
            )}
            {aba === "caixa" && <CashFlowChart data={v.flow} />}
            {aba === "evolucao" && <AreaMoneyChart data={v.evolution} dataKey="saldo" name="Saldo do mês" zeroLine />}
            {aba === "comparativo" && (v.comparison.length ? <HorizontalBars data={v.comparison} /> : <EmptyState title="Sem despesas para comparar" />)}
          </Superficie>
        </div>

        {/* coluna lateral (no celular, continua abaixo) */}
        <div className="stagger min-w-0 space-y-5 lg:space-y-6">
          <Superficie label="Contas">
            <Titulo acao={<LinkSecao href="/contas">Gerenciar</LinkSecao>}>Contas</Titulo>
            {s.contas.length ? (
              <>
              <ul className="-my-1 divide-y divide-slate-100 dark:divide-line/70">
                {(todasContas ? s.contas : s.contas.slice(0, 3)).map((a) => {
                  return (
                    <li key={a.id}>
                      <Link href={`/contas/${a.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50 dark:hover:bg-tint/[0.03]">
                        <AvatarConta nome={a.name} cor={a.color} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{ACCOUNT_TYPE_LABEL[a.type]}</p>
                        </div>
                        <span className={cx("money shrink-0 text-[15px] font-semibold", !oculto && a.saldo < 0 && "text-rose-600 dark:text-rose-400")}>{valor(a.saldo)}</span>
                        <ChevronRight className="size-4 shrink-0 text-slate-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {s.contas.length > 3 && (
                <button type="button" onClick={() => setTodasContas((x) => !x)} aria-expanded={todasContas} className="mt-1 flex min-h-10 w-full items-center justify-center gap-1 rounded-xl border-t border-slate-100 pt-2 text-[13px] font-medium text-slate-500 transition hover:text-slate-900 dark:border-line dark:text-slate-400 dark:hover:text-white">
                  {todasContas ? "Mostrar menos" : `Ver todas as contas (${s.contas.length})`}
                  <ChevronDown className={cx("size-3.5 transition-transform", todasContas && "rotate-180")} />
                </button>
              )}
              </>
            ) : (
              <div className="py-2 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma conta cadastrada.</p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => forms.openAccount()}>Cadastrar conta</Button>
              </div>
            )}
          </Superficie>

          <Superficie label="Últimas movimentações">
            <Titulo acao={<LinkSecao href="/despesas">Ver todas</LinkSecao>}>Últimas movimentações</Titulo>
            {v.ultimas.length ? (
              <ul className="-my-1 divide-y divide-slate-100 dark:divide-line/70">
                {v.ultimas.map((e) => {
                  const cat = e.category_id ? catPorId.get(e.category_id) : null;
                  return (
                    <li key={`${e.source}-${e.id}`} className="flex items-center gap-3 py-2.5">
                      <span className="relative shrink-0">
                        <CategoryIcon category={cat} kind={e.type} />
                        <span aria-label={e.type === "receita" ? "entrada" : "saída"} className={cx("absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full ring-2 ring-white dark:ring-navy-900", e.type === "receita" ? "bg-brand-400 text-navy-950" : "bg-rose-400 text-navy-950")}>
                          {e.type === "receita" ? <ArrowDownLeft className="size-2.5" strokeWidth={3} /> : <ArrowUpRight className="size-2.5" strokeWidth={3} />}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium">{e.description}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {formatBR(e.date).slice(0, 5)} · {cat?.name ?? "Sem categoria"}{e.source === "cartao" ? " · cartão" : ""}
                        </p>
                      </div>
                      <Money value={e.type === "receita" ? e.amount : -e.amount} signed colored className="shrink-0 text-sm font-semibold" />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-2 text-center text-sm text-slate-500 dark:text-slate-400">Nada pago ou recebido ainda.</p>
            )}
          </Superficie>

          {(v.budgets.length > 0 || v.insights.length > 0) && (
            <Superficie label="Alertas">
              <Titulo acao={<LinkSecao href="/inteligencia">Abrir</LinkSecao>}>Alertas</Titulo>
              {v.budgets.length > 0 && (
                <ul className="mb-3 space-y-3">
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
              )}
              <div className="space-y-3">
                {v.insights.map((i) => <InsightCard key={i.id} insight={i} bare />)}
              </div>
            </Superficie>
          )}
        </div>
      </div>
    </>
  );
}
