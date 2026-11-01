"use client";
// Abre qualquer formulário de qualquer tela (botão de ação rápida, listas, cartões...).
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Account, Budget, CardPurchase, Category, CategoryKind, CreditCard, Goal, GoalKind, Loan, Transaction } from "@/lib/types";
import type { Invoice } from "@/lib/finance/cards";
import { TxForm } from "./tx-form";
import { InvoicePayForm, SettleForm, TransferForm } from "./money-forms";
import { AccountForm, CardForm, PurchaseForm } from "./card-forms";
import { BudgetForm, CategoryForm, GoalForm, LoanForm } from "./plan-forms";

type State =
  | { type: "tx"; kind: "receita" | "despesa"; tx?: Transaction }
  | { type: "transfer"; tx?: Transaction }
  | { type: "settle"; tx: Transaction }
  | { type: "purchase"; cardId?: string; purchase?: CardPurchase }
  | { type: "card"; card?: CreditCard }
  | { type: "account"; account?: Account }
  | { type: "invoice"; invoice: Invoice }
  | { type: "loan"; loan?: Loan }
  | { type: "budget"; budget?: Budget }
  | { type: "goal"; goal?: Goal; kind?: GoalKind }
  | { type: "category"; category?: Category; kind?: CategoryKind; parentId?: string | null }
  | null;

interface Forms {
  openTx: (o: { kind: "receita" | "despesa"; tx?: Transaction }) => void;
  openTransfer: (tx?: Transaction) => void;
  openSettle: (tx: Transaction) => void;
  openPurchase: (o: { cardId?: string; purchase?: CardPurchase }) => void;
  openCard: (card?: CreditCard) => void;
  openAccount: (account?: Account) => void;
  openInvoicePay: (invoice: Invoice) => void;
  openLoan: (loan?: Loan) => void;
  openBudget: (budget?: Budget) => void;
  openGoal: (o?: { goal?: Goal; kind?: GoalKind }) => void;
  openCategory: (o?: { category?: Category; kind?: CategoryKind; parentId?: string | null }) => void;
  /** Abre o formulário certo para editar um lançamento qualquer. */
  editTx: (tx: Transaction) => void;
}

const Ctx = createContext<Forms | null>(null);

export function FormsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<State>(null);
  const close = () => setS(null);
  const forms: Forms = {
    openTx: (o) => setS({ type: "tx", ...o }),
    openTransfer: (tx) => setS({ type: "transfer", tx }),
    openSettle: (tx) => setS({ type: "settle", tx }),
    openPurchase: (o) => setS({ type: "purchase", ...o }),
    openCard: (card) => setS({ type: "card", card }),
    openAccount: (account) => setS({ type: "account", account }),
    openInvoicePay: (invoice) => setS({ type: "invoice", invoice }),
    openLoan: (loan) => setS({ type: "loan", loan }),
    openBudget: (budget) => setS({ type: "budget", budget }),
    openGoal: (o) => setS({ type: "goal", ...o }),
    openCategory: (o) => setS({ type: "category", ...o }),
    editTx: (tx) => {
      if (tx.kind === "transferencia") setS({ type: "transfer", tx });
      else if (tx.kind === "receita" || tx.kind === "despesa") setS({ type: "tx", kind: tx.kind, tx });
    },
  };
  return (
    <Ctx.Provider value={forms}>
      {children}
      {s?.type === "tx" && <TxForm key={s.tx?.id ?? s.kind} kind={s.kind} tx={s.tx} onClose={close} />}
      {s?.type === "transfer" && <TransferForm tx={s.tx} onClose={close} />}
      {s?.type === "settle" && <SettleForm tx={s.tx} onClose={close} />}
      {s?.type === "purchase" && <PurchaseForm cardId={s.cardId} purchase={s.purchase} onClose={close} />}
      {s?.type === "card" && <CardForm card={s.card} onClose={close} />}
      {s?.type === "account" && <AccountForm account={s.account} onClose={close} />}
      {s?.type === "invoice" && <InvoicePayForm invoice={s.invoice} onClose={close} />}
      {s?.type === "loan" && <LoanForm loan={s.loan} onClose={close} />}
      {s?.type === "budget" && <BudgetForm budget={s.budget} onClose={close} />}
      {s?.type === "goal" && <GoalForm goal={s.goal} kind={s.kind} onClose={close} />}
      {s?.type === "category" && <CategoryForm category={s.category} kind={s.kind} parentId={s.parentId} onClose={close} />}
    </Ctx.Provider>
  );
}

export function useForms(): Forms {
  const v = useContext(Ctx);
  if (!v) throw new Error("useForms fora do FormsProvider");
  return v;
}
