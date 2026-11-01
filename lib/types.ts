// Tipos que espelham as tabelas do Supabase (supabase/schema.sql). Valores em centavos.

export type AccountType = "corrente" | "poupanca" | "carteira" | "dinheiro" | "investimento";
export type TxKind = "receita" | "despesa" | "transferencia" | "fatura";
export type CategoryKind = "receita" | "despesa";
export type GoalKind = "reserva" | "meta" | "compra";

export interface Account {
  id: string;
  user_id?: string;
  name: string;
  type: AccountType;
  initial_balance: number;
  color: string;
  archived: boolean;
  created_at?: string;
}

export interface Category {
  id: string;
  user_id?: string;
  name: string;
  kind: CategoryKind;
  parent_id: string | null;
  color: string;
  created_at?: string;
}

export interface CreditCard {
  id: string;
  user_id?: string;
  name: string;
  institution: string;
  brand: string;
  limit_amount: number;
  closing_day: number;
  due_day: number;
  color: string;
  archived: boolean;
  created_at?: string;
}

export interface CardPurchase {
  id: string;
  user_id?: string;
  card_id: string;
  description: string;
  category_id: string | null;
  total: number;
  installments: number;
  purchase_date: string;
  notes: string;
  created_at?: string;
}

export interface CardInstallment {
  id: string;
  user_id?: string;
  purchase_id: string;
  card_id: string;
  number: number;
  amount: number;
  invoice_month: string; // YYYY-MM-01
}

export interface Transaction {
  id: string;
  user_id?: string;
  kind: TxKind;
  description: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  payment_method: string;
  notes: string;
  recurrence_id: string | null;
  recurrence_index: number | null;
  recurrence_total: number | null;
  parent_id: string | null;
  loan_id: string | null;
  loan_installment: number | null;
  card_id: string | null;
  invoice_month: string | null;
  created_at?: string;
}

export interface Loan {
  id: string;
  user_id?: string;
  institution: string;
  description: string;
  principal: number;
  installment_amount: number;
  installments_count: number;
  monthly_rate: number; // % ao mês
  contract_date: string;
  first_due_date: string;
  notes: string;
  created_at?: string;
}

export interface Budget {
  id: string;
  user_id?: string;
  category_id: string;
  amount: number;
}

export interface Goal {
  id: string;
  user_id?: string;
  name: string;
  kind: GoalKind;
  target: number;
  saved: number;
  deadline: string | null;
  notes: string;
  created_at?: string;
}

export interface FinanceData {
  accounts: Account[];
  categories: Category[];
  cards: CreditCard[];
  purchases: CardPurchase[];
  installments: CardInstallment[];
  transactions: Transaction[];
  loans: Loan[];
  budgets: Budget[];
  goals: Goal[];
}

export const EMPTY_DATA: FinanceData = {
  accounts: [],
  categories: [],
  cards: [],
  purchases: [],
  installments: [],
  transactions: [],
  loans: [],
  budgets: [],
  goals: [],
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  carteira: "Carteira digital",
  dinheiro: "Dinheiro",
  investimento: "Investimentos",
};

export const PAYMENT_METHODS = [
  "Pix",
  "Débito",
  "Dinheiro",
  "Boleto",
  "Transferência",
  "Débito automático",
  "Outro",
];

export const CARD_BRANDS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"];
