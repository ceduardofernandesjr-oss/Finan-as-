import { describe, expect, it } from "vitest";
import type { Account, CardInstallment, CardPurchase, Category, CreditCard, FinanceData, Transaction } from "../lib/types";
import { EMPTY_DATA } from "../lib/types";
import { dueDate } from "../lib/finance/cards";
import {
  ajusteSaldoInicial, faturaDoPagamento, importable, localDate, montarImportacao, normalizeAccount, normalizeTx, sugerir,
  type BankTx, type Mapeamento,
} from "../lib/finance/bank-sync";

const cat = (id: string, name: string, kind: "receita" | "despesa"): Category => ({ id, name, kind, parent_id: null, color: "#000" });
const categories = [
  cat("alim", "Alimentação", "despesa"), cat("transp", "Transporte", "despesa"), cat("casa", "Contas domésticas", "despesa"),
  cat("lazer", "Lazer", "despesa"), cat("outros", "Outros", "despesa"), cat("sal", "Salário", "receita"), cat("outrasr", "Outras receitas", "receita"),
];
const acc = (id: string, name: string): Account => ({ id, name, type: "corrente", initial_balance: 0, color: "#000", archived: false });
const card: CreditCard = { id: "c1", name: "Nubank", institution: "Nubank", brand: "Mastercard", limit_amount: 500000, closing_day: 28, due_day: 5, color: "#000", archived: false };
let n = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${++n}`, kind: "despesa", description: "x", amount: 1000, due_date: "2026-11-01", paid_date: null, account_id: null, to_account_id: null,
  category_id: null, payment_method: "", notes: "", recurrence_id: null, recurrence_index: null, recurrence_total: null, parent_id: null,
  loan_id: null, loan_installment: null, card_id: null, invoice_month: null, created_at: "2026-10-01T00:00:00Z", ...p,
});
const tenis: CardPurchase = { id: "p1", card_id: "c1", description: "Tênis", category_id: "outros", total: 30000, installments: 3, purchase_date: "2026-09-15", notes: "" };
const data: FinanceData = {
  ...EMPTY_DATA,
  categories,
  accounts: [acc("a1", "Itaú"), acc("a2", "Poupança")],
  cards: [card],
  purchases: [tenis],
  installments: [] as CardInstallment[],
  transactions: [
    tx({ description: "Mercado X", amount: 5000, due_date: "2026-11-03", paid_date: "2026-11-03", account_id: "a1", category_id: "alim" }),
    tx({ description: "Conta de luz", amount: 18900, due_date: "2026-11-10", category_id: "casa" }),
    tx({ description: "Padaria do Zé 123", amount: 900, due_date: "2026-10-02", paid_date: "2026-10-02", account_id: "a1", category_id: "lazer" }),
  ],
};
const mapas: Mapeamento[] = [
  { external_id: "acc-1", kind: "conta", account_id: "a1", card_id: null, name: "Itaú" },
  { external_id: "acc-2", kind: "conta", account_id: "a2", card_id: null, name: "Poupança" },
  { external_id: "card-1", kind: "cartao", account_id: null, card_id: "c1", name: "Nubank" },
];
const b = (p: Partial<BankTx> & { id: string }): BankTx => ({
  accountId: "acc-1", date: "2026-11-05", description: "x", amount: 1000, direction: "saida", status: "POSTED", installment: null, category: null, paymentMethod: "", ...p,
});

describe("Pluggy: normalização", () => {
  it("converte a data para o horário do Brasil sem deslocar datas puras", () => {
    expect(localDate("2026-11-05T00:00:00.000Z")).toBe("2026-11-05");
    expect(localDate("2026-11-05T02:30:00.000Z")).toBe("2026-11-04");
    expect(localDate("2026-11-05T15:00:00Z")).toBe("2026-11-05");
    expect(localDate("2026-11-05")).toBe("2026-11-05");
  });
  it("sinais: conta pelo tipo, cartão pelo sinal (positivo = compra)", () => {
    const c = normalizeTx({ id: "1", accountId: "x", date: "2026-11-05T00:00:00.000Z", description: " PIX  RECEBIDO ", amount: 150.5, type: "CREDIT", status: "POSTED", paymentData: { paymentMethod: "PIX" } }, "conta");
    expect(c).toMatchObject({ amount: 15050, direction: "entrada", description: "PIX RECEBIDO", paymentMethod: "Pix" });
    expect(normalizeTx({ id: "2", date: "2026-11-05", amount: -42.1, type: "DEBIT" }, "conta")).toMatchObject({ amount: 4210, direction: "saida" });
    expect(normalizeTx({ id: "3", date: "2026-11-05", amount: 99.9, type: "DEBIT", creditCardMetadata: { installmentNumber: 2, totalInstallments: 5 } }, "cartao"))
      .toMatchObject({ amount: 9990, direction: "saida", installment: { n: 2, total: 5 } });
    expect(normalizeTx({ id: "4", date: "2026-11-05", amount: -500, type: "CREDIT" }, "cartao")).toMatchObject({ direction: "entrada" });
  });
  it("na conta só entra o que já foi efetivado; no cartão, tudo", () => {
    expect(importable(b({ id: "p", status: "PENDING" }), "conta")).toBe(false);
    expect(importable(b({ id: "p", status: "PENDING" }), "cartao")).toBe(true);
    expect(importable(b({ id: "z", amount: 0 }), "conta")).toBe(false);
  });
  it("conta do cartão traz limite e dias de fechamento e vencimento", () => {
    const a = normalizeAccount({ id: "k", itemId: "i", type: "CREDIT", subtype: "CREDIT_CARD", name: "Ultravioleta", number: "1234", balance: 1234.56,
      creditData: { creditLimit: 8000, balanceCloseDate: "2026-11-28T00:00:00.000Z", balanceDueDate: "2026-12-05T00:00:00.000Z" } });
    expect(a).toMatchObject({ kind: "cartao", balance: 123456, creditLimit: 800000, closingDay: 28, dueDay: 5 });
  });
});

describe("Pluggy: sugestões", () => {
  const itens: BankTx[] = [
    b({ id: "1", description: "MERCADO X", amount: 5000, date: "2026-11-04" }),
    b({ id: "2", description: "ENEL CONTA LUZ", amount: 18900, date: "2026-11-09" }),
    b({ id: "3", description: "SALARIO EMPRESA", amount: 450000, direction: "entrada" }),
    b({ id: "4", description: "TRANSF POUPANCA", amount: 100000, date: "2026-11-06" }),
    b({ id: "5", accountId: "acc-2", description: "TRANSF RECEBIDA", amount: 100000, date: "2026-11-06", direction: "entrada" }),
    b({ id: "6", description: "PAGAMENTO FATURA NUBANK", amount: 80000 }),
    b({ id: "7", accountId: "card-1", description: "TENIS LOJA", amount: 10000, date: "2026-10-15", installment: { n: 2, total: 3 } }),
    b({ id: "8", accountId: "card-1", description: "UBER *TRIP", amount: 3590, date: "2026-11-02" }),
    b({ id: "9", accountId: "card-1", description: "PAGAMENTO RECEBIDO", amount: 80000, direction: "entrada" }),
    b({ id: "10", accountId: "card-1", description: "ESTORNO LOJA", amount: 2000, direction: "entrada" }),
    b({ id: "11", accountId: "card-1", description: "LOJA Y", amount: 5000, installment: { n: 1, total: 4 } }),
    b({ id: "12", description: "PADARIA DO ZE 456", amount: 1200 }),
    b({ id: "13", description: "XPTO LTDA", amount: 2500, category: "Groceries" }),
    b({ id: "14", accountId: "acc-9", description: "conta não mapeada" }),
  ];
  const s = new Map(sugerir(itens, mapas, data).map((x) => [x.tx.id, x]));
  it("o que já foi lançado à mão começa ignorado, com o motivo", () => {
    expect(s.get("1")).toMatchObject({ acao: "ignorar", motivo: "Parece já lançado: Mercado X" });
    expect(s.get("2")).toMatchObject({ acao: "quitar", match_id: "t2", category_id: null });
    expect(s.get("2")!.motivo).toMatch(/Já pago no banco: marca "Conta de luz" como paga/);
    expect(s.get("7")).toMatchObject({ acao: "ignorar", motivo: "Parece já lançada: Tênis" });
  });
  it("receitas e despesas com categoria sugerida", () => {
    expect(s.get("3")).toMatchObject({ acao: "receita", category_id: "sal" });
    expect(s.get("8")).toMatchObject({ acao: "compra", category_id: "transp", card_id: "c1" });
    expect(s.get("13")).toMatchObject({ acao: "despesa", category_id: "alim" }); // categoria da Pluggy
    expect(s.get("12")).toMatchObject({ acao: "despesa", category_id: "lazer" }); // histórico vence palavra-chave
  });
  it("transferência entre contas conectadas vira uma só, sem receita nem despesa", () => {
    expect(s.get("4")).toMatchObject({ acao: "transferencia", to_account_id: "a2", category_id: null });
    expect(s.get("5")).toMatchObject({ acao: "ignorar", motivo: "Entrada da transferência de Itaú" });
  });
  it("pagamento de fatura na conta não vira despesa", () => {
    const f = s.get("6")!;
    expect(f).toMatchObject({ acao: "fatura", card_id: "c1", category_id: null });
    expect(dueDate(card, f.invoice_month!)).toBe("2026-11-05");
  });
  it("no cartão, pagamentos e estornos ficam de fora e parcelas ganham o número", () => {
    expect(s.get("9")!.motivo).toMatch(/Pagamento da fatura/);
    expect(s.get("10")!.motivo).toMatch(/estorno/i);
    expect(s.get("11")).toMatchObject({ acao: "compra", description: "LOJA Y (1/4)" });
  });
  it("conta do banco sem mapeamento não aparece", () => {
    expect(s.has("14")).toBe(false);
  });
  it("transferência cuja entrada vem antes da saída também é casada", () => {
    const r = sugerir([b({ id: "e", accountId: "acc-2", direction: "entrada", amount: 777, date: "2026-11-05" }), b({ id: "s", amount: 777, date: "2026-11-06" })], mapas, data);
    expect(r.find((x) => x.tx.id === "s")!.acao).toBe("transferencia");
    expect(r.find((x) => x.tx.id === "e")!.acao).toBe("ignorar");
  });
});

describe("Pluggy: lote de importação", () => {
  const sugs = sugerir([
    b({ id: "r", description: "SALARIO", amount: 450000, direction: "entrada" }),
    b({ id: "c", accountId: "card-1", description: "UBER", amount: 3590, date: "2026-11-02" }),
    b({ id: "f", description: "PAGAMENTO FATURA NUBANK", amount: 80000 }),
    b({ id: "i", accountId: "card-1", description: "ESTORNO", amount: 100, direction: "entrada" }),
  ], mapas, data);
  const lote = montarImportacao(sugs, data);
  const por = new Map(lote.map((x) => [x.external_id, x]));
  it("monta receita paga, compra à vista no cartão, pagamento de fatura e ignorados", () => {
    expect(por.get("r")).toMatchObject({ action: "transacao", tx: { kind: "receita", amount: 450000, paid_date: "2026-11-05", account_id: "a1", category_id: "sal" } });
    const compra = por.get("c")!.purchase as { total: number; installments: { amount: number }[] };
    expect(compra.total).toBe(3590);
    expect(compra.installments).toHaveLength(1);
    expect(compra.installments[0].amount).toBe(3590);
    expect(por.get("f")).toMatchObject({ action: "transacao", tx: { kind: "fatura", card_id: "c1", category_id: null } });
    expect(por.get("i")).toEqual({ external_id: "i", action: "ignorar" });
  });
  it("transferência marcada numa entrada vai da outra conta para esta", () => {
    const [e] = sugerir([b({ id: "in", direction: "entrada", amount: 500 })], mapas, data);
    const lote = montarImportacao([{ ...e, acao: "transferencia", to_account_id: "a2", category_id: null }], data);
    expect(lote[0].tx).toMatchObject({ kind: "transferencia", account_id: "a2", to_account_id: "a1" });
    expect(() => montarImportacao([{ ...e, acao: "despesa" }], data)).toThrow(/entrada não pode ser despesa/);
  });
  it("conta pendente no app já paga no banco é quitada, sem criar outra", () => {
    const [q] = sugerir([b({ id: "q", description: "ENEL", amount: 18900, date: "2026-11-09" })], mapas, data);
    expect(montarImportacao([q], data)[0]).toEqual({ external_id: "q", action: "quitar", transaction_id: "t2", paid_date: "2026-11-09", account_id: "a1" });
  });
  it("recusa linha sem conta do app", () => {
    const sem = sugs.map((x) => (x.tx.id === "r" ? { ...x, map: { ...x.map, account_id: null } } : x));
    expect(() => montarImportacao(sem, data)).toThrow(/SALARIO.*escolha a conta/);
  });
  it("ajuste de saldo inicial para bater com o banco", () => {
    expect(ajusteSaldoInicial(150000, 120000, 10000)).toBe(40000);
    expect(faturaDoPagamento(card, "2026-11-04")).toBe(faturaDoPagamento(card, "2026-11-06"));
  });
});
