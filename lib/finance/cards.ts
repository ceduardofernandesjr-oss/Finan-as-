// Cartões de crédito: em qual fatura cai cada parcela, totais de fatura e limite comprometido.
import type { CardInstallment, CardPurchase, CreditCard, Transaction } from "../types";
import { addMonths, daysInMonth, monthStart, parts, toISO, type ISODate } from "./dates";
import { splitEvenly, sum } from "./money";

type CardDays = Pick<CreditCard, "closing_day" | "due_day">;

/** Data de fechamento da fatura do mês (AAAA-MM-01). Dia 31 em mês curto vira o último dia. */
export function closingDate(card: CardDays, invoiceMonth: ISODate): ISODate {
  const { y, m } = parts(invoiceMonth);
  return toISO(y, m, Math.min(card.closing_day, daysInMonth(y, m)));
}

/**
 * Vencimento da fatura: no mesmo mês do fechamento quando o dia de vencimento é depois do
 * fechamento (fecha 5, vence 12); senão, no mês seguinte (fecha 28, vence 5).
 */
export function dueDate(card: CardDays, invoiceMonth: ISODate): ISODate {
  const month = card.due_day > card.closing_day ? monthStart(invoiceMonth) : addMonths(monthStart(invoiceMonth), 1);
  const { y, m } = parts(month);
  return toISO(y, m, Math.min(card.due_day, daysInMonth(y, m)));
}

/**
 * Fatura (identificada pelo mês de fechamento, AAAA-MM-01) de uma compra feita em `date`.
 * Compras no dia do fechamento ou depois já entram na fatura seguinte — o "melhor dia de compra".
 */
export function invoiceMonthFor(card: CardDays, date: ISODate): ISODate {
  const month = monthStart(date);
  return date < closingDate(card, month) ? month : addMonths(month, 1);
}

/** Melhor dia de compra = dia do fechamento. */
export function bestPurchaseDay(card: CardDays): number {
  return card.closing_day;
}

/** Parcelas de uma compra: valores que somam o total e a fatura de cada uma. */
export function buildInstallments(
  card: CardDays,
  purchaseDate: ISODate,
  total: number,
  count: number,
): { number: number; amount: number; invoice_month: ISODate }[] {
  const first = invoiceMonthFor(card, purchaseDate);
  return splitEvenly(total, count).map((amount, i) => ({
    number: i + 1,
    amount,
    invoice_month: addMonths(first, i),
  }));
}

export type InvoiceStatus = "aberta" | "fechada" | "paga" | "vencida" | "futura";

export interface Invoice {
  cardId: string;
  month: ISODate; // AAAA-MM-01 do fechamento
  closing: ISODate;
  due: ISODate;
  total: number;
  paid: number;
  remaining: number;
  status: InvoiceStatus;
  items: CardInstallment[];
}

export function invoiceStatus(inv: Pick<Invoice, "closing" | "due" | "total" | "paid" | "month">, today: ISODate, currentMonth: ISODate): InvoiceStatus {
  if (inv.total > 0 && inv.paid >= inv.total) return "paga";
  if (today >= inv.closing) return today > inv.due ? (inv.total - inv.paid > 0 ? "vencida" : "paga") : "fechada";
  return inv.month === currentMonth ? "aberta" : "futura";
}

/** Todas as faturas de um cartão (as que têm parcelas ou pagamentos), da mais antiga para a mais nova. */
export function cardInvoices(
  card: CreditCard,
  installments: CardInstallment[],
  transactions: Transaction[],
  today: ISODate,
): Invoice[] {
  const byMonth = new Map<string, { items: CardInstallment[]; paid: number }>();
  const get = (m: string) => {
    let e = byMonth.get(m);
    if (!e) byMonth.set(m, (e = { items: [], paid: 0 }));
    return e;
  };
  for (const it of installments) if (it.card_id === card.id) get(it.invoice_month).items.push(it);
  for (const t of transactions)
    if (t.kind === "fatura" && t.card_id === card.id && t.invoice_month) get(t.invoice_month).paid += t.amount;

  const current = invoiceMonthFor(card, today);
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, e]) => {
      const total = sum(e.items.map((i) => i.amount));
      const base = { cardId: card.id, month, closing: closingDate(card, month), due: dueDate(card, month), total, paid: e.paid };
      return {
        ...base,
        remaining: Math.max(0, total - e.paid),
        status: invoiceStatus(base, today, current),
        items: e.items.sort((a, b) => a.number - b.number),
      };
    });
}

/** Fatura atual (a que está recebendo compras hoje). */
export function currentInvoiceMonth(card: CardDays, today: ISODate): ISODate {
  return invoiceMonthFor(card, today);
}

/**
 * Limite comprometido = todas as parcelas lançadas (inclusive as futuras) menos o que já foi pago.
 * É assim que os bancos calculam: uma compra parcelada ocupa o limite inteiro até ser paga.
 */
export function cardUsage(card: CreditCard, installments: CardInstallment[], transactions: Transaction[]) {
  const charged = sum(installments.filter((i) => i.card_id === card.id).map((i) => i.amount));
  const paid = sum(transactions.filter((t) => t.kind === "fatura" && t.card_id === card.id).map((t) => t.amount));
  const used = Math.max(0, charged - paid);
  return { used, available: Math.max(0, card.limit_amount - used), limit: card.limit_amount };
}

/** Parcelas que ainda vão cair em faturas futuras (depois da fatura atual). */
export function futureInstallments(card: CreditCard, installments: CardInstallment[], today: ISODate) {
  const current = currentInvoiceMonth(card, today);
  return installments.filter((i) => i.card_id === card.id && i.invoice_month > current);
}

/** Dívida do cartão em uma data (para evolução do patrimônio): compras até a data − pagamentos até a data. */
export function cardDebtAt(
  cardId: string,
  purchases: CardPurchase[],
  transactions: Transaction[],
  date: ISODate,
): number {
  const bought = sum(purchases.filter((p) => p.card_id === cardId && p.purchase_date <= date).map((p) => p.total));
  const paid = sum(
    transactions
      .filter((t) => t.kind === "fatura" && t.card_id === cardId && t.paid_date && t.paid_date <= date)
      .map((t) => t.amount),
  );
  return Math.max(0, bought - paid);
}
