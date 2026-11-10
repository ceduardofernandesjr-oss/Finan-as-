// Painel (tela Início): indicadores consolidados, sempre calculados a partir dos dados reais.
//
// Regras:
//  * Saldo disponível = contas ativas que não são de investimento, na data de hoje.
//  * Saldo consolidado = todas as contas ativas (disponível + investimentos).
//  * Patrimônio líquido = tudo o que se tem (todas as contas, inclusive arquivadas)
//    − faturas de cartão em aberto (compras ainda não pagas) − saldo devedor dos empréstimos.
//  * Receita e despesa vêm de `buildEntries`: transferências e pagamentos de fatura ficam de fora
//    (só movem dinheiro entre contas) e cada parcela de cartão conta uma vez só.
import type { AccountType, FinanceData } from "../types";
import { addDays, diffDays, type ISODate } from "./dates";
import { accountBalance, effectOn } from "./ledger";
import { cardDebtAt } from "./cards";
import { loanBalanceAt } from "./loans";
import { sum } from "./money";
import { entriesIn, pendingCommitments, totals, type Commitment, type Entry } from "./reports";

export interface AccountRow {
  id: string;
  name: string;
  color: string;
  type: AccountType;
  saldo: number;
}

export interface BalanceSummary {
  contas: AccountRow[];
  disponivel: number;
  investido: number;
  consolidado: number;
  temInvestimentos: boolean;
  ativos: number;
  dividaCartoes: number;
  dividaEmprestimos: number;
  dividas: number;
  patrimonio: number;
}

/** Saldos de hoje: disponível, consolidado e patrimônio líquido. */
export function balanceSummary(data: FinanceData, today: ISODate): BalanceSummary {
  const saldo = (id: string) => {
    const a = data.accounts.find((x) => x.id === id)!;
    return accountBalance(a, data.transactions, today);
  };
  const contas: AccountRow[] = data.accounts
    .filter((a) => !a.archived)
    .map((a) => ({ id: a.id, name: a.name, color: a.color, type: a.type, saldo: saldo(a.id) }))
    .sort((a, b) => b.saldo - a.saldo);
  const investimentos = contas.filter((a) => a.type === "investimento");
  const disponivel = sum(contas.filter((a) => a.type !== "investimento").map((a) => a.saldo));
  const investido = sum(investimentos.map((a) => a.saldo));
  const arquivadas = sum(data.accounts.filter((a) => a.archived).map((a) => saldo(a.id)));
  const ativos = disponivel + investido + arquivadas;
  const dividaCartoes = sum(data.cards.map((c) => cardDebtAt(c.id, data.purchases, data.transactions, today)));
  const dividaEmprestimos = sum(data.loans.map((l) => loanBalanceAt(l, data.transactions, today)));
  const dividas = dividaCartoes + dividaEmprestimos;
  return {
    contas,
    disponivel,
    investido,
    consolidado: disponivel + investido,
    temInvestimentos: investimentos.length > 0,
    ativos,
    dividaCartoes,
    dividaEmprestimos,
    dividas,
    patrimonio: ativos - dividas,
  };
}

/** Variação percentual; `null` quando não há base de comparação (período anterior zerado). */
export function pctChange(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export type Range = { from: ISODate; to: ISODate };

/** Receitas, despesas e resultado do período e do período anterior, com a variação. */
export function periodSummary(entries: Entry[], atual: Range, anterior: Range) {
  const a = totals(entriesIn(entries, atual.from, atual.to));
  const b = totals(entriesIn(entries, anterior.from, anterior.to));
  return {
    atual: a,
    anterior: b,
    variacao: {
      receitas: pctChange(a.receitas, b.receitas),
      despesas: pctChange(a.despesas, b.despesas),
      resultado: a.saldo - b.saldo,
    },
  };
}

/**
 * Pendências (a receber ou a pagar) com vencimento no período.
 * `emAtraso` é a parte do período que já venceu; `atrasadoAntes` são pendências vencidas
 * de antes do período (não somam no total do período, para nada ser contado duas vezes).
 */
export function pendingSummary(commitments: Commitment[], range: Range, lado: "receber" | "pagar") {
  const lista = commitments.filter((c) => (lado === "receber" ? c.type === "receita" : c.type !== "receita"));
  const noPeriodo = lista.filter((c) => c.date >= range.from && c.date <= range.to);
  const antes = lista.filter((c) => c.overdue && c.date < range.from);
  return {
    total: sum(noPeriodo.map((c) => c.amount)),
    quantidade: noPeriodo.length,
    emAtraso: sum(noPeriodo.filter((c) => c.overdue).map((c) => c.amount)),
    atrasadoAntes: sum(antes.map((c) => c.amount)),
    quantidadeAtrasadoAntes: antes.length,
  };
}

export interface DueItem extends Commitment {
  /** Dias até o vencimento (0 = hoje; negativo = dias em atraso). */
  dias: number;
}

/** Contas vencidas e as que vencem nos próximos `dias` dias (a pagar e a receber). */
export function dueSoon(commitments: Commitment[], today: ISODate, dias = 7) {
  const limite = addDays(today, dias);
  const comDias = (c: Commitment): DueItem => ({ ...c, dias: diffDays(c.date, today) });
  const atrasados = commitments.filter((c) => c.overdue).map(comDias);
  const proximos = commitments.filter((c) => !c.overdue && c.date <= limite).map(comDias);
  const pagar = (l: DueItem[]) => sum(l.filter((c) => c.type !== "receita").map((c) => c.amount));
  const receber = (l: DueItem[]) => sum(l.filter((c) => c.type === "receita").map((c) => c.amount));
  return {
    atrasados,
    proximos,
    totalPagarAtrasado: pagar(atrasados),
    totalPagarProximos: pagar(proximos),
    totalReceberProximos: receber(proximos),
  };
}

/**
 * Previsão do saldo de um conjunto de contas, dia a dia, de hoje até `to`.
 * Parte do saldo de hoje e aplica: lançamentos já marcados como pagos com data futura,
 * contas a pagar e a receber pendentes e faturas em aberto. Pendências atrasadas entram hoje.
 * Pendências sem conta definida são consideradas saindo/entrando nessas contas.
 */
export function forecastBalance(data: FinanceData, today: ISODate, to: ISODate, accountIds: string[]) {
  const ids = new Set(accountIds);
  const contas = data.accounts.filter((a) => ids.has(a.id));
  const start = sum(contas.map((a) => accountBalance(a, data.transactions, today)));
  const deltas = new Map<ISODate, number>();
  let entradas = 0;
  let saidas = 0;
  let atrasadosIncluidos = 0;
  const add = (d: ISODate, v: number) => {
    if (!v) return;
    deltas.set(d, (deltas.get(d) ?? 0) + v);
    if (v > 0) entradas += v;
    else saidas -= v;
  };
  for (const t of data.transactions) {
    if (!t.paid_date || t.paid_date <= today || t.paid_date > to) continue;
    add(t.paid_date, sum(contas.map((a) => effectOn(t, a.id))));
  }
  for (const c of pendingCommitments(data, today)) {
    if (c.overdue) atrasadosIncluidos++;
    const d = c.date < today ? today : c.date;
    if (d > to) continue;
    add(d, c.type === "receita" ? c.amount : -c.amount);
  }
  const series: { date: ISODate; saldo: number }[] = [];
  let saldo = start;
  for (let d = today; d <= to; d = addDays(d, 1)) {
    saldo += deltas.get(d) ?? 0;
    series.push({ date: d, saldo });
  }
  const min = series.reduce((m, p) => (p.saldo < m.saldo ? p : m), series[0] ?? { date: today, saldo: start });
  return { start, end: series.at(-1)?.saldo ?? start, min, entradas, saidas, atrasadosIncluidos, series };
}
