// Relatórios: receitas x despesas, categorias, fluxo de caixa, patrimônio, projeção e orçamento.
import type { Budget, Category, FinanceData, Transaction } from "../types";
import { cardDebtAt, cardInvoices, type Invoice } from "./cards";
import { addDays, addMonths, monthEnd, monthKey, monthRange, monthStart, parts, type ISODate } from "./dates";
import { accountBalance, txStatus } from "./ledger";
import { loanBalanceAt } from "./loans";
import { sum } from "./money";

/**
 * Um item de resultado (receita ou despesa), venha de um lançamento ou de uma parcela de cartão.
 * Compras no cartão contam como despesa na data da compra (1ª parcela) e as demais parcelas
 * um mês depois da outra. O pagamento da fatura NÃO é despesa (só tira o dinheiro da conta),
 * então nada é contado duas vezes.
 */
export interface Entry {
  id: string;
  date: ISODate;
  type: "receita" | "despesa";
  amount: number;
  category_id: string | null;
  description: string;
  source: "lancamento" | "cartao";
  settled: boolean; // lançamento pago/recebido (parcelas de cartão contam como realizadas)
  card_id?: string;
  recurrence_id?: string | null;
}

export function buildEntries(data: FinanceData): Entry[] {
  const out: Entry[] = [];
  for (const t of data.transactions) {
    if (t.kind !== "receita" && t.kind !== "despesa") continue;
    out.push({
      id: t.id,
      date: t.due_date,
      type: t.kind,
      amount: t.amount,
      category_id: t.category_id,
      description: t.description,
      source: "lancamento",
      settled: !!t.paid_date,
      recurrence_id: t.recurrence_id,
    });
  }
  const purchases = new Map(data.purchases.map((p) => [p.id, p]));
  for (const i of data.installments) {
    const p = purchases.get(i.purchase_id);
    if (!p) continue;
    out.push({
      id: i.id,
      date: addMonths(p.purchase_date, i.number - 1),
      type: "despesa",
      amount: i.amount,
      category_id: p.category_id,
      description: p.installments > 1 ? `${p.description} (${i.number}/${p.installments})` : p.description,
      source: "cartao",
      settled: true,
      card_id: p.card_id,
    });
  }
  return out;
}

export function entriesIn(entries: Entry[], from: ISODate, to: ISODate): Entry[] {
  return entries.filter((e) => e.date >= from && e.date <= to);
}

export function totals(entries: Entry[]) {
  let receitas = 0, despesas = 0, recebido = 0, pago = 0;
  for (const e of entries) {
    if (e.type === "receita") {
      receitas += e.amount;
      if (e.settled) recebido += e.amount;
    } else {
      despesas += e.amount;
      if (e.settled) pago += e.amount;
    }
  }
  return { receitas, despesas, saldo: receitas - despesas, recebido, pago };
}

export interface MonthResult {
  month: string;
  receitas: number;
  despesas: number;
  saldo: number;
}

export function resultByMonth(entries: Entry[], months: string[]): MonthResult[] {
  const map = new Map(months.map((m) => [m, { month: m, receitas: 0, despesas: 0, saldo: 0 }]));
  for (const e of entries) {
    const r = map.get(monthKey(e.date));
    if (!r) continue;
    if (e.type === "receita") r.receitas += e.amount;
    else r.despesas += e.amount;
  }
  for (const r of map.values()) r.saldo = r.receitas - r.despesas;
  return [...map.values()];
}

/** Categoria "raiz" (subcategorias somam na categoria principal). */
export function rootCategory(categories: Category[], id: string | null): Category | null {
  if (!id) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  let c = byId.get(id) ?? null;
  while (c?.parent_id) c = byId.get(c.parent_id) ?? c;
  return c;
}

export interface CategoryTotal {
  id: string;
  name: string;
  color: string;
  amount: number;
  pct: number;
}

export function byCategory(
  entries: Entry[],
  categories: Category[],
  type: "receita" | "despesa",
  groupSubcategories = true,
): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const acc = new Map<string, CategoryTotal>();
  let total = 0;
  for (const e of entries) {
    if (e.type !== type) continue;
    const cat = groupSubcategories ? rootCategory(categories, e.category_id) : e.category_id ? byId.get(e.category_id) ?? null : null;
    const key = cat?.id ?? "sem";
    let row = acc.get(key);
    if (!row) acc.set(key, (row = { id: key, name: cat?.name ?? "Sem categoria", color: cat?.color ?? "#94a3b8", amount: 0, pct: 0 }));
    row.amount += e.amount;
    total += e.amount;
  }
  const rows = [...acc.values()].sort((a, b) => b.amount - a.amount);
  for (const r of rows) r.pct = total ? (r.amount / total) * 100 : 0;
  return rows;
}

/**
 * Fluxo de caixa realizado: dinheiro que entrou e saiu das contas (pela data de pagamento).
 * Inclui pagamentos de fatura; ignora transferências entre contas.
 */
export function cashFlow(transactions: Transaction[], months: string[]) {
  const map = new Map(months.map((m) => [m, { month: m, entradas: 0, saidas: 0, liquido: 0 }]));
  for (const t of transactions) {
    if (!t.paid_date || t.kind === "transferencia") continue;
    const r = map.get(monthKey(t.paid_date));
    if (!r) continue;
    if (t.kind === "receita") r.entradas += t.amount;
    else r.saidas += t.amount;
  }
  for (const r of map.values()) r.liquido = r.entradas - r.saidas;
  return [...map.values()];
}

/** Patrimônio no fim de cada mês: saldo das contas − faturas de cartão − saldo devedor de empréstimos. */
export function netWorthSeries(data: FinanceData, months: string[], today: ISODate) {
  return months.map((m) => {
    const end = monthEnd(`${m}-01`);
    const date = end > today ? today : end;
    const assets = sum(data.accounts.map((a) => accountBalance(a, data.transactions, date)));
    const cardDebt = sum(data.cards.map((c) => cardDebtAt(c.id, data.purchases, data.transactions, date)));
    const loanDebt = sum(data.loans.map((l) => loanBalanceAt(l, data.transactions, date)));
    return { month: m, ativos: assets, dividas: cardDebt + loanDebt, patrimonio: assets - cardDebt - loanDebt };
  });
}

/** Faturas de todos os cartões. */
export function allInvoices(data: FinanceData, today: ISODate): Invoice[] {
  return data.cards.flatMap((c) => cardInvoices(c, data.installments, data.transactions, today));
}

/** Compromissos pendentes (contas a pagar/receber + faturas a pagar) — base da projeção e do calendário. */
export interface Commitment {
  id: string;
  date: ISODate;
  type: "receita" | "despesa" | "fatura";
  amount: number;
  description: string;
  overdue: boolean;
  tx?: Transaction;
  invoice?: Invoice;
}

export function pendingCommitments(data: FinanceData, today: ISODate): Commitment[] {
  const out: Commitment[] = [];
  for (const t of data.transactions) {
    if (t.paid_date || (t.kind !== "receita" && t.kind !== "despesa")) continue;
    out.push({
      id: t.id,
      date: t.due_date,
      type: t.kind,
      amount: t.amount,
      description: t.description,
      overdue: txStatus(t, today) === "atrasado",
      tx: t,
    });
  }
  const cardsById = new Map(data.cards.map((c) => [c.id, c]));
  for (const inv of allInvoices(data, today)) {
    if (inv.remaining <= 0) continue;
    out.push({
      id: `fatura-${inv.cardId}-${inv.month}`,
      date: inv.due,
      type: "fatura",
      amount: inv.remaining,
      description: `Fatura ${cardsById.get(inv.cardId)?.name ?? "cartão"}`,
      overdue: inv.due < today,
      invoice: inv,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Projeção do saldo total das contas, dia a dia, de hoje até `to`.
 * Atrasados entram como se fossem quitados hoje (o compromisso continua existindo).
 */
export function projectBalance(data: FinanceData, today: ISODate, to: ISODate) {
  const start = sum(data.accounts.map((a) => accountBalance(a, data.transactions)));
  const deltas = new Map<string, number>();
  for (const c of pendingCommitments(data, today)) {
    const d = c.date < today ? today : c.date;
    if (d > to) continue;
    deltas.set(d, (deltas.get(d) ?? 0) + (c.type === "receita" ? c.amount : -c.amount));
  }
  const series: { date: ISODate; saldo: number }[] = [];
  let bal = start;
  for (let d = today; d <= to; d = addDays(d, 1)) {
    bal += deltas.get(d) ?? 0;
    series.push({ date: d, saldo: bal });
  }
  const min = series.reduce((m, p) => (p.saldo < m.saldo ? p : m), series[0] ?? { date: today, saldo: start });
  return { start, end: series[series.length - 1]?.saldo ?? start, min, series };
}

export interface BudgetStatus {
  budget: Budget;
  category: Category | null;
  spent: number;
  remaining: number;
  pct: number;
  level: "ok" | "alerta" | "estourado";
}

/** Orçamento do mês: gasto da categoria (com subcategorias) contra o limite. Alerta a partir de 80%. */
export function budgetStatus(budgets: Budget[], categories: Category[], entries: Entry[], month: string): BudgetStatus[] {
  const from = `${month}-01`;
  const monthEntries = entriesIn(entries, from, monthEnd(from)).filter((e) => e.type === "despesa");
  const byId = new Map(categories.map((c) => [c.id, c]));
  return budgets
    .map((b) => {
      const spent = sum(
        monthEntries
          .filter((e) => {
            if (!e.category_id) return false;
            if (e.category_id === b.category_id) return true;
            return byId.get(e.category_id)?.parent_id === b.category_id;
          })
          .map((e) => e.amount),
      );
      const pct = (spent / b.amount) * 100;
      return {
        budget: b,
        category: byId.get(b.category_id) ?? null,
        spent,
        remaining: b.amount - spent,
        pct,
        level: (pct > 100 ? "estourado" : pct >= 80 ? "alerta" : "ok") as BudgetStatus["level"],
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

/** Despesas recorrentes ativas (agrupadas pela série), com valor médio por ocorrência. */
export function recurringExpenses(transactions: Transaction[], categories: Category[], today: ISODate) {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.kind !== "despesa" || !t.recurrence_id) continue;
    const g = groups.get(t.recurrence_id) ?? [];
    g.push(t);
    groups.set(t.recurrence_id, g);
  }
  const byId = new Map(categories.map((c) => [c.id, c]));
  return [...groups.entries()]
    .map(([id, txs]) => {
      txs.sort((a, b) => a.due_date.localeCompare(b.due_date));
      const future = txs.filter((t) => t.due_date >= monthStart(today));
      return {
        id,
        description: txs[0].description,
        category: txs[0].category_id ? byId.get(txs[0].category_id) ?? null : null,
        amount: Math.round(sum(txs.map((t) => t.amount)) / txs.length),
        occurrences: txs.length,
        remaining: future.length,
        next: txs.find((t) => !t.paid_date)?.due_date ?? null,
        active: future.length > 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

/** Meses (AAAA-MM) dos últimos `n` meses terminando no mês de `today`. */
export function lastMonths(today: ISODate, n: number): string[] {
  return monthRange(addMonths(monthStart(today), -(n - 1)), today);
}

/** Meses de um intervalo de datas. */
export function monthsBetween(from: ISODate, to: ISODate): string[] {
  return monthRange(from, to);
}

export function yearOf(date: ISODate): number {
  return parts(date).y;
}
