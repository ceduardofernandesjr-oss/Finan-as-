// Empréstimos e financiamentos (tabela Price), simulações (Price e SAC).
import type { Loan, Transaction } from "../types";
import { addMonths, parts, type ISODate } from "./dates";
import { sum } from "./money";

/** Parcela fixa (Price). rate em % ao mês. Resultado em centavos. */
export function pricePayment(principal: number, ratePct: number, n: number): number {
  const r = ratePct / 100;
  if (n <= 0) return 0;
  if (r === 0) return Math.ceil(principal / n);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -n)));
}

/** Saldo devedor com `remaining` parcelas por pagar: valor presente das parcelas restantes. */
export function outstandingBalance(installment: number, ratePct: number, remaining: number): number {
  if (remaining <= 0) return 0;
  const r = ratePct / 100;
  if (r === 0) return installment * remaining;
  return Math.round(installment * ((1 - Math.pow(1 + r, -remaining)) / r));
}

/** Taxa mensal implícita (%) a partir de valor, parcela e prazo (método de Newton). */
export function impliedRate(principal: number, installment: number, n: number): number {
  if (installment * n <= principal) return 0;
  let r = 0.02;
  for (let i = 0; i < 100; i++) {
    const f = (installment * (1 - Math.pow(1 + r, -n))) / r - principal;
    const df =
      (installment * (n * Math.pow(1 + r, -n - 1) * r - (1 - Math.pow(1 + r, -n)))) / (r * r);
    const next = r - f / df;
    if (!Number.isFinite(next) || next <= 0) break;
    if (Math.abs(next - r) < 1e-10) {
      r = next;
      break;
    }
    r = next;
  }
  return Math.round(r * 100 * 10000) / 10000;
}

export interface LoanStatus {
  loan: Loan;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  paidAmount: number;
  balance: number; // saldo devedor atualizado
  nextDue: Transaction | null;
  payoffDate: ISODate; // previsão de quitação
  totalInterest: number;
  progress: number; // 0..1
  installments: Transaction[];
}

export function loanStatus(loan: Loan, transactions: Transaction[], today: ISODate): LoanStatus {
  const installments = transactions
    .filter((t) => t.loan_id === loan.id)
    .sort((a, b) => (a.loan_installment ?? 0) - (b.loan_installment ?? 0) || a.due_date.localeCompare(b.due_date));
  const paid = installments.filter((t) => t.paid_date);
  const pending = installments.filter((t) => !t.paid_date);
  const lastPending = pending[pending.length - 1];
  return {
    loan,
    paidCount: paid.length,
    pendingCount: pending.length,
    overdueCount: pending.filter((t) => t.due_date < today).length,
    paidAmount: sum(paid.map((t) => t.amount)),
    balance: outstandingBalance(loan.installment_amount, Number(loan.monthly_rate), pending.length),
    nextDue: pending[0] ?? null,
    payoffDate: lastPending?.due_date ?? paid[paid.length - 1]?.paid_date ?? loan.first_due_date,
    totalInterest: Math.max(0, loan.installment_amount * loan.installments_count - loan.principal),
    progress: loan.installments_count ? paid.length / loan.installments_count : 0,
    installments,
  };
}

/** Saldo devedor numa data passada (para a evolução da dívida e do patrimônio). */
export function loanBalanceAt(loan: Loan, transactions: Transaction[], date: ISODate): number {
  if (date < loan.contract_date) return 0;
  const own = transactions.filter((t) => t.loan_id === loan.id);
  const paidBy = own.filter((t) => t.paid_date && t.paid_date <= date).length;
  return outstandingBalance(loan.installment_amount, Number(loan.monthly_rate), own.length - paidBy);
}

/** Datas de vencimento mensais a partir do primeiro vencimento. */
export function loanDueDates(firstDue: ISODate, n: number): ISODate[] {
  const day = parts(firstDue).d;
  return Array.from({ length: n }, (_, i) => addMonths(firstDue, i, day));
}

export interface ScheduleRow {
  n: number;
  payment: number;
  interest: number;
  amortization: number;
  balance: number;
}

/** Tabela de amortização (Price ou SAC), em centavos. */
export function amortizationSchedule(
  principal: number,
  ratePct: number,
  n: number,
  system: "price" | "sac",
): ScheduleRow[] {
  const r = ratePct / 100;
  const rows: ScheduleRow[] = [];
  let balance = principal;
  const pmt = pricePayment(principal, ratePct, n);
  const amortSac = Math.round(principal / n);
  for (let i = 1; i <= n; i++) {
    const interest = Math.round(balance * r);
    let amortization = system === "price" ? pmt - interest : amortSac;
    if (i === n) amortization = balance; // última parcela zera o saldo
    const payment = amortization + interest;
    balance -= amortization;
    rows.push({ n: i, payment, interest, amortization, balance: Math.max(0, balance) });
  }
  return rows;
}

/**
 * Antecipação de parcelas: quanto pagar hoje por `k` parcelas futuras, com desconto dos juros
 * (valor presente à taxa do contrato). As parcelas antecipadas são as últimas.
 */
export function prepaymentValue(installment: number, ratePct: number, remaining: number, k: number): number {
  const r = ratePct / 100;
  let pv = 0;
  for (let i = remaining - k + 1; i <= remaining; i++) pv += installment / Math.pow(1 + r, i);
  return Math.round(pv);
}
