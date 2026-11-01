// Lançamentos: situação, saldos das contas, recorrência.
import type { Account, Transaction } from "../types";
import { addDays, addMonths, parts, type ISODate } from "./dates";
import { sum } from "./money";

export type TxStatus = "pago" | "pendente" | "atrasado";

export function txStatus(t: Pick<Transaction, "paid_date" | "due_date">, today: ISODate): TxStatus {
  if (t.paid_date) return "pago";
  return t.due_date < today ? "atrasado" : "pendente";
}

export function statusLabel(status: TxStatus, kind: Transaction["kind"]): string {
  if (status === "pago") return kind === "receita" ? "Recebido" : "Pago";
  if (status === "atrasado") return "Atrasado";
  return "Pendente";
}

/** Efeito de um lançamento pago no saldo de uma conta (centavos, com sinal). */
export function effectOn(t: Transaction, accountId: string): number {
  if (!t.paid_date) return 0;
  let v = 0;
  if (t.account_id === accountId) {
    if (t.kind === "receita") v += t.amount;
    else v -= t.amount; // despesa, fatura, transferência (saída)
  }
  if (t.kind === "transferencia" && t.to_account_id === accountId) v += t.amount;
  return v;
}

/** Saldo de uma conta: saldo inicial + movimentos pagos (até `date`, se informado). */
export function accountBalance(account: Account, transactions: Transaction[], date?: ISODate): number {
  let b = account.initial_balance;
  for (const t of transactions) {
    if (!t.paid_date || (date && t.paid_date > date)) continue;
    b += effectOn(t, account.id);
  }
  return b;
}

export function totalBalance(accounts: Account[], transactions: Transaction[], date?: ISODate): number {
  return sum(accounts.filter((a) => !a.archived || date).map((a) => accountBalance(a, transactions, date)));
}

/** Movimentos de uma conta, com saldo após cada um (do mais novo para o mais antigo). */
export function accountStatement(account: Account, transactions: Transaction[]) {
  const rows = transactions
    .filter((t) => t.paid_date && (t.account_id === account.id || t.to_account_id === account.id))
    .sort((a, b) => (a.paid_date! === b.paid_date! ? (a.created_at ?? "").localeCompare(b.created_at ?? "") : a.paid_date!.localeCompare(b.paid_date!)));
  let running = account.initial_balance;
  const out = rows.map((t) => {
    const effect = effectOn(t, account.id);
    running += effect;
    return { tx: t, effect, balance: running };
  });
  return out.reverse();
}

export type Frequency = "semanal" | "quinzenal" | "mensal" | "anual";

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  anual: "Anual",
};

/** Datas das ocorrências de um lançamento recorrente (a primeira é a própria data). */
export function recurrenceDates(start: ISODate, freq: Frequency, count: number): ISODate[] {
  const day = parts(start).d;
  return Array.from({ length: count }, (_, i) => {
    switch (freq) {
      case "semanal":
        return addDays(start, 7 * i);
      case "quinzenal":
        return addDays(start, 14 * i);
      case "mensal":
        return addMonths(start, i, day);
      case "anual":
        return addMonths(start, 12 * i, day);
    }
  });
}

/** Despesa ou receita que conta no resultado (exclui transferências e pagamentos de fatura). */
export function isResult(t: Transaction): boolean {
  return t.kind === "receita" || t.kind === "despesa";
}
