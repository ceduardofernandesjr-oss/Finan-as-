import { describe, expect, it } from "vitest";
import type { Account, CardInstallment, CardPurchase, CreditCard, FinanceData, Transaction } from "../lib/types";
import { EMPTY_DATA } from "../lib/types";
import { buildEntries, pendingCommitments } from "../lib/finance/reports";
import { balanceSummary, dueSoon, forecastBalance, pctChange, pendingSummary, periodSummary } from "../lib/finance/dashboard";

// Cenário fixo: hoje é 09/11/2026. Valores em centavos.
const TODAY = "2026-11-09";
const NOV = { from: "2026-11-01", to: "2026-11-30" };
const OUT = { from: "2026-10-01", to: "2026-10-31" };

let n = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${++n}`, kind: "despesa", description: "x", amount: 1000, due_date: TODAY, paid_date: null,
  account_id: null, to_account_id: null, category_id: null, payment_method: "", notes: "",
  recurrence_id: null, recurrence_index: null, recurrence_total: null, parent_id: null,
  loan_id: null, loan_installment: null, card_id: null, invoice_month: null, ...p,
});
const acc = (p: Partial<Account>): Account => ({ id: "a", name: "Conta", type: "corrente", initial_balance: 0, color: "#000", archived: false, ...p });

const card: CreditCard = { id: "c1", name: "Cartão", institution: "", brand: "Visa", limit_amount: 500000, closing_day: 5, due_day: 12, color: "#000", archived: false };
const purchase: CardPurchase = { id: "p1", card_id: "c1", description: "TV", category_id: null, total: 90000, installments: 3, purchase_date: "2026-10-20", notes: "" };
const installments: CardInstallment[] = [1, 2, 3].map((i) => ({
  id: `i${i}`, purchase_id: "p1", card_id: "c1", number: i, amount: 30000, invoice_month: ["2026-11-01", "2026-12-01", "2027-01-01"][i - 1],
}));

const data: FinanceData = {
  ...EMPTY_DATA,
  accounts: [
    acc({ id: "a1", name: "Corrente", initial_balance: 100000 }),
    acc({ id: "a2", name: "Corretora", type: "investimento", initial_balance: 500000 }),
    acc({ id: "a3", name: "Antiga", archived: true }),
  ],
  cards: [card],
  purchases: [purchase],
  installments,
  transactions: [
    // outubro
    tx({ kind: "receita", description: "Salário out", amount: 400000, due_date: "2026-10-05", paid_date: "2026-10-05", account_id: "a1" }),
    tx({ kind: "despesa", description: "Compras out", amount: 100000, due_date: "2026-10-10", paid_date: "2026-10-10", account_id: "a1" }),
    tx({ kind: "receita", description: "Reembolso", amount: 20000, due_date: "2026-10-25" }), // vencido, de antes do período
    // novembro
    tx({ kind: "receita", description: "Salário", amount: 500000, due_date: "2026-11-05", paid_date: "2026-11-05", account_id: "a1" }),
    tx({ kind: "despesa", description: "Aluguel", amount: 200000, due_date: "2026-11-10" }),
    tx({ kind: "despesa", description: "Luz", amount: 30000, due_date: "2026-11-03" }), // vencida no período
    tx({ kind: "receita", description: "Freela", amount: 80000, due_date: "2026-11-20" }),
    tx({ kind: "despesa", description: "Mercado", amount: 50000, due_date: "2026-11-02", paid_date: "2026-11-02", account_id: "a1" }),
    // pagamento parcial: o original ficou com 6.000 pendente e o filho com 4.000 pago
    tx({ id: "net", kind: "despesa", description: "Internet", amount: 6000, due_date: "2026-11-15" }),
    tx({ kind: "despesa", description: "Internet (parcial)", amount: 4000, due_date: "2026-11-15", paid_date: "2026-11-08", account_id: "a1", parent_id: "net" }),
    // movimentos que não são receita nem despesa
    tx({ kind: "transferencia", description: "Aplicação", amount: 100000, due_date: "2026-11-06", paid_date: "2026-11-06", account_id: "a1", to_account_id: "a2" }),
    tx({ kind: "fatura", description: "Fatura nov", amount: 30000, due_date: "2026-11-07", paid_date: "2026-11-07", account_id: "a1", card_id: "c1", invoice_month: "2026-11-01" }),
    tx({ kind: "transferencia", description: "Entre minhas contas", amount: 5000, due_date: "2026-11-12", paid_date: "2026-11-12", account_id: "a1", to_account_id: "a3" }),
    // já marcada como paga, mas com data futura
    tx({ kind: "despesa", description: "Débito agendado", amount: 15000, due_date: "2026-11-25", paid_date: "2026-11-25", account_id: "a1" }),
  ],
};
const entries = buildEntries(data);

describe("painel: saldos", () => {
  const s = balanceSummary(data, TODAY);
  it("separa saldo disponível de investimentos e usa o saldo de hoje", () => {
    // 1.000 + 4.000 − 1.000 (out) + 5.000 − 1.000 (aplicação) − 500 − 40 − 300 (fatura) = 7.160
    expect(s.disponivel).toBe(716000);
    expect(s.investido).toBe(600000);
    expect(s.consolidado).toBe(1316000);
    expect(s.temInvestimentos).toBe(true);
    expect(s.contas.map((c) => c.id)).toEqual(["a1", "a2"]); // arquivada fora da lista
  });
  it("patrimônio líquido = ativos − dívidas (cartão em aberto e empréstimos)", () => {
    expect(s.dividaCartoes).toBe(60000); // 900 de compra − 300 pagos
    expect(s.dividaEmprestimos).toBe(0);
    expect(s.patrimonio).toBe(s.ativos - s.dividas);
    expect(s.patrimonio).toBe(1256000);
  });
});

describe("painel: período e comparação", () => {
  const r = periodSummary(entries, NOV, OUT);
  it("não conta transferências nem pagamento de fatura e não duplica o pagamento parcial", () => {
    expect(r.atual.receitas).toBe(580000);
    // aluguel + luz + mercado + internet (6.000 + 4.000) + agendado + parcela do cartão
    expect(r.atual.despesas).toBe(200000 + 30000 + 50000 + 10000 + 15000 + 30000);
  });
  it("separa o realizado do previsto (status de pagamento)", () => {
    expect(r.atual.recebido).toBe(500000);
    expect(r.atual.pago).toBe(50000 + 4000 + 15000 + 30000);
  });
  it("compara com o período anterior", () => {
    expect(r.anterior.receitas).toBe(420000);
    expect(r.anterior.despesas).toBe(130000);
    expect(r.variacao.receitas).toBeCloseTo(38.095, 2);
    expect(r.variacao.despesas).toBeCloseTo(157.69, 1);
    expect(r.variacao.resultado).toBe(245000 - 290000);
  });
  it("não inventa variação sem base", () => {
    expect(pctChange(1000, 0)).toBeNull();
    expect(pctChange(500, 1000)).toBe(-50);
    expect(pctChange(-50, -100)).toBe(50);
  });
});

describe("painel: pendências e vencimentos", () => {
  const commitments = pendingCommitments(data, TODAY);
  it("a receber do período sem somar o atraso de antes", () => {
    const p = pendingSummary(commitments, NOV, "receber");
    expect(p.total).toBe(80000);
    expect(p.emAtraso).toBe(0);
    expect(p.atrasadoAntes).toBe(20000);
    expect(p.quantidadeAtrasadoAntes).toBe(1);
  });
  it("a pagar do período inclui faturas abertas e marca as vencidas", () => {
    const p = pendingSummary(commitments, NOV, "pagar");
    expect(p.total).toBe(200000 + 30000 + 6000); // fatura de nov já paga; a de dez vence fora
    expect(p.emAtraso).toBe(30000);
  });
  it("lista vencidas e as dos próximos 7 dias com os dias que faltam", () => {
    const d = dueSoon(commitments, TODAY, 7);
    expect(d.atrasados.map((c) => [c.description, c.dias])).toEqual([["Reembolso", -15], ["Luz", -6]]);
    expect(d.proximos.map((c) => [c.description, c.dias])).toEqual([["Aluguel", 1], ["Internet", 6]]);
    expect(d.totalPagarAtrasado).toBe(30000);
    expect(d.totalPagarProximos).toBe(206000);
  });
});

describe("painel: previsão até o fim do mês", () => {
  const f = forecastBalance(data, TODAY, NOV.to, ["a1", "a3"]);
  it("parte do saldo de hoje e aplica pendências, atrasados e agendados", () => {
    expect(f.start).toBe(716000);
    expect(f.entradas).toBe(20000 + 80000);
    expect(f.saidas).toBe(30000 + 200000 + 6000 + 15000);
    expect(f.end).toBe(565000);
    expect(f.atrasadosIncluidos).toBe(2);
  });
  it("transferência entre as próprias contas previstas não muda o total", () => {
    expect(f.series.find((p) => p.date === "2026-11-12")!.saldo).toBe(f.series.find((p) => p.date === "2026-11-11")!.saldo);
  });
  it("aponta o menor saldo do mês", () => {
    expect(f.min).toEqual({ date: "2026-11-15", saldo: 500000 });
    expect(f.series).toHaveLength(22);
  });
});
