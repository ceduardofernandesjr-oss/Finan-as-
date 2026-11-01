"use client";
// Estado do app: carrega os dados do usuário do Supabase e oferece as operações (com validação no banco).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./supabase/client";
import type {
  Account, Budget, CardInstallment, CardPurchase, Category, CreditCard, FinanceData, Goal, Loan, Transaction,
} from "./types";
import { EMPTY_DATA } from "./types";
import { todayISO, type ISODate } from "./finance/dates";
import { buildEntries, type Entry } from "./finance/reports";

const TABLES = {
  accounts: "accounts",
  categories: "categories",
  cards: "credit_cards",
  purchases: "card_purchases",
  installments: "card_installments",
  transactions: "transactions",
  loans: "loans",
  budgets: "budgets",
  goals: "goals",
} as const satisfies Record<keyof FinanceData, string>;

/** O Supabase devolve no máximo 1000 linhas por vez: buscamos em páginas. */
async function fetchAll<T>(table: string): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase()
      .from(table)
      .select("*")
      .order("created_at", { ascending: true, nullsFirst: true })
      .order("id")
      .range(from, from + page - 1);
    if (error) throw new Error(friendlyError(error.message));
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

async function fetchInstallments(): Promise<CardInstallment[]> {
  const page = 1000;
  const out: CardInstallment[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase()
      .from("card_installments")
      .select("*")
      .order("invoice_month")
      .order("id")
      .range(from, from + page - 1);
    if (error) throw new Error(friendlyError(error.message));
    out.push(...((data ?? []) as CardInstallment[]));
    if (!data || data.length < page) break;
  }
  return out;
}

/** Traduz erros do banco para mensagens que a pessoa entende. */
export function friendlyError(msg: string): string {
  if (/violates foreign key constraint/i.test(msg) && /accounts/i.test(msg))
    return "Esta conta tem lançamentos. Arquive a conta em vez de excluí-la.";
  if (/violates foreign key constraint/i.test(msg)) return "Este registro está ligado a outros dados e não pode ser removido.";
  if (/duplicate key|unique/i.test(msg)) return "Já existe um registro com esse nome.";
  if (/row-level security/i.test(msg)) return "Sem permissão para esse dado. Entre novamente.";
  if (/JWT|session|not authenticated|não autenticado/i.test(msg)) return "Sua sessão expirou. Entre novamente.";
  if (/Failed to fetch|NetworkError|fetch failed/i.test(msg)) return "Sem conexão com o servidor. Verifique sua internet.";
  if (/check constraint/i.test(msg)) return "Algum valor está fora do permitido. Revise o formulário.";
  return msg;
}

async function run<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(friendlyError(error.message));
  return data;
}

type NewRow<T> = Omit<T, "id" | "user_id" | "created_at">;

export interface FinanceContext {
  data: FinanceData;
  entries: Entry[];
  loading: boolean;
  error: string | null;
  today: ISODate;
  reload: () => Promise<void>;
  // genéricos
  insert: <K extends keyof FinanceData>(table: K, rows: Partial<FinanceData[K][number]> | Partial<FinanceData[K][number]>[]) => Promise<void>;
  update: <K extends keyof FinanceData>(table: K, id: string, patch: Partial<FinanceData[K][number]>) => Promise<void>;
  remove: <K extends keyof FinanceData>(table: K, ids: string | string[]) => Promise<void>;
  // operações com regras
  settle: (id: string, amount: number, date: ISODate, accountId: string) => Promise<void>;
  saveCardPurchase: (args: {
    id?: string | null;
    card_id: string;
    description: string;
    category_id: string | null;
    total: number;
    installments: { number: number; amount: number; invoice_month: string }[];
    purchase_date: string;
    notes: string;
  }) => Promise<void>;
  createLoan: (args: {
    loan: NewRow<Loan>;
    category_id: string | null;
    paid_count: number;
    account_id: string | null;
    installments: { number: number; due_date: string; amount: number }[];
  }) => Promise<void>;
  updateSeries: (recurrenceId: string, fromDate: ISODate, patch: Partial<Transaction>) => Promise<void>;
  removeSeries: (recurrenceId: string, fromDate: ISODate) => Promise<void>;
  restoreBackup: (payload: unknown) => Promise<void>;
}

const Ctx = createContext<FinanceContext | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FinanceData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(todayISO());

  const reload = useCallback(async () => {
    try {
      const [accounts, categories, cards, purchases, installments, transactions, loans, budgets, goals] = await Promise.all([
        fetchAll<Account>(TABLES.accounts),
        fetchAll<Category>(TABLES.categories),
        fetchAll<CreditCard>(TABLES.cards),
        fetchAll<CardPurchase>(TABLES.purchases),
        fetchInstallments(),
        fetchAll<Transaction>(TABLES.transactions),
        fetchAll<Loan>(TABLES.loans),
        fetchAll<Budget>(TABLES.budgets),
        fetchAll<Goal>(TABLES.goals),
      ]);
      setData({
        accounts,
        categories: categories.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
        cards,
        purchases,
        installments,
        transactions,
        loans: loans.map((l) => ({ ...l, monthly_rate: Number(l.monthly_rate) })),
        budgets,
        goals,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setToday(todayISO());
    }
  }, []);

  useEffect(() => {
    (async () => {
      // garante as categorias padrão (quem se cadastrou antes de o banco existir)
      await supabase().rpc("ensure_defaults");
      await reload();
    })();
    const onFocus = () => setToday(todayISO());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const value = useMemo<FinanceContext>(() => {
    const db = () => supabase();
    return {
      data,
      entries: buildEntries(data),
      loading,
      error,
      today,
      reload,
      insert: async (table, rows) => {
        await run(db().from(TABLES[table]).insert(rows as object));
        await reload();
      },
      update: async (table, id, patch) => {
        const { id: _i, user_id: _u, created_at: _c, ...clean } = patch as Record<string, unknown>;
        await run(db().from(TABLES[table]).update(clean).eq("id", id));
        await reload();
      },
      remove: async (table, ids) => {
        const list = Array.isArray(ids) ? ids : [ids];
        await run(db().from(TABLES[table]).delete().in("id", list));
        await reload();
      },
      settle: async (id, amount, date, accountId) => {
        await run(db().rpc("settle_transaction", { p_id: id, p_amount: amount, p_date: date, p_account: accountId }));
        await reload();
      },
      saveCardPurchase: async (a) => {
        await run(
          db().rpc("save_card_purchase", {
            p_id: a.id ?? null,
            p_card: a.card_id,
            p_description: a.description,
            p_category: a.category_id,
            p_total: a.total,
            p_installments_count: a.installments.length,
            p_purchase_date: a.purchase_date,
            p_notes: a.notes,
            p_installments: a.installments,
          }),
        );
        await reload();
      },
      createLoan: async ({ loan, category_id, paid_count, account_id, installments }) => {
        await run(
          db().rpc("create_loan", {
            p_institution: loan.institution,
            p_description: loan.description,
            p_principal: loan.principal,
            p_installment_amount: loan.installment_amount,
            p_installments_count: loan.installments_count,
            p_monthly_rate: loan.monthly_rate,
            p_contract_date: loan.contract_date,
            p_first_due_date: loan.first_due_date,
            p_notes: loan.notes,
            p_category: category_id,
            p_paid_count: paid_count,
            p_account: account_id,
            p_installments: installments,
          }),
        );
        await reload();
      },
      updateSeries: async (recurrenceId, fromDate, patch) => {
        await run(
          db().from("transactions").update(patch).eq("recurrence_id", recurrenceId).gte("due_date", fromDate).is("paid_date", null),
        );
        await reload();
      },
      removeSeries: async (recurrenceId, fromDate) => {
        // remove as ocorrências ainda não pagas a partir da data (as já pagas ficam no histórico)
        await run(
          db().from("transactions").delete().eq("recurrence_id", recurrenceId).gte("due_date", fromDate).is("paid_date", null),
        );
        await reload();
      },
      restoreBackup: async (payload) => {
        await run(db().rpc("restore_backup", { p_data: payload }));
        await reload();
      },
    };
  }, [data, loading, error, today, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinance(): FinanceContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFinance fora do FinanceProvider");
  return v;
}

/** Nome de categoria com a categoria-mãe: "Alimentação › Mercado". */
export function categoryLabel(categories: Category[], id: string | null | undefined): string {
  if (!id) return "Sem categoria";
  const c = categories.find((x) => x.id === id);
  if (!c) return "Sem categoria";
  const parent = c.parent_id ? categories.find((x) => x.id === c.parent_id) : null;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}
