import { describe, expect, it } from "vitest";
import type { Account, CardInstallment, CardPurchase, CreditCard, FinanceData, Loan, Transaction } from "../lib/types";
import { EMPTY_DATA } from "../lib/types";
import { formatMoney, parseMoney, splitEvenly } from "../lib/finance/money";
import { addMonths, parseDateBR, periodRange } from "../lib/finance/dates";
import { buildInstallments, cardInvoices, cardUsage, closingDate, dueDate, invoiceMonthFor } from "../lib/finance/cards";
import { accountBalance, accountStatement, recurrenceDates, txStatus } from "../lib/finance/ledger";
import { amortizationSchedule, impliedRate, loanStatus, outstandingBalance, pricePayment, prepaymentValue } from "../lib/finance/loans";
import { budgetStatus, buildEntries, byCategory, cashFlow, netWorthSeries, projectBalance, totals } from "../lib/finance/reports";
import { analyze, canISpend, cashVsInstallments } from "../lib/finance/insights";

const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  kind: "despesa",
  description: "x",
  amount: 1000,
  due_date: "2026-11-10",
  paid_date: null,
  account_id: null,
  to_account_id: null,
  category_id: null,
  payment_method: "",
  notes: "",
  recurrence_id: null,
  recurrence_index: null,
  recurrence_total: null,
  parent_id: null,
  loan_id: null,
  loan_installment: null,
  card_id: null,
  invoice_month: null,
  ...p,
});

const acc = (p: Partial<Account> = {}): Account => ({
  id: "a1", name: "Conta", type: "corrente", initial_balance: 100000, color: "#000", archived: false, ...p,
});

const card: CreditCard = {
  id: "c1", name: "Cartão", institution: "", brand: "Visa", limit_amount: 500000,
  closing_day: 5, due_day: 12, color: "#000", archived: false,
};

describe("dinheiro", () => {
  it("converte texto em centavos", () => {
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("R$ 10")).toBe(1000);
    expect(parseMoney("10,5")).toBe(1050);
    expect(parseMoney("1234.56")).toBe(123456);
    expect(parseMoney("1.234")).toBe(123400);
    expect(parseMoney("-50,00")).toBe(-5000);
    expect(parseMoney("(25,10)")).toBe(-2510);
    expect(parseMoney("1,234.50")).toBe(123450);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("formata em reais", () => {
    expect(formatMoney(123456)).toBe("R$ 1.234,56");
    expect(formatMoney(-500)).toMatch(/-\s?R\$ 5,00|R\$ -5,00/);
  });
  it("divide sem perder centavos", () => {
    expect(splitEvenly(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(splitEvenly(10, 4)).toEqual([3, 3, 2, 2]);
  });
});

describe("datas", () => {
  it("soma meses respeitando o fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2, 31)).toBe("2026-03-31");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15");
  });
  it("lê datas brasileiras", () => {
    expect(parseDateBR("05/11/2026")).toBe("2026-11-05");
    expect(parseDateBR("5/1/26")).toBe("2026-01-05");
    expect(parseDateBR("2026-11-05")).toBe("2026-11-05");
    expect(parseDateBR("31/02/2026")).toBeNull();
  });
  it("períodos", () => {
    expect(periodRange("semana", "2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" }); // domingo
    expect(periodRange("trimestre", "2026-11-01")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(periodRange("mes", "2026-11-20", -1)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
});

describe("cartão de crédito", () => {
  it("compra antes do fechamento cai na fatura do mês; no dia do fechamento ou depois, na seguinte", () => {
    expect(invoiceMonthFor(card, "2026-11-04")).toBe("2026-11-01");
    expect(invoiceMonthFor(card, "2026-11-05")).toBe("2026-12-01");
    expect(invoiceMonthFor(card, "2026-12-20")).toBe("2027-01-01");
  });
  it("vencimento no mesmo mês ou no seguinte", () => {
    expect(dueDate(card, "2026-11-01")).toBe("2026-11-12");
    const late = { closing_day: 28, due_day: 5 };
    expect(dueDate(late, "2026-11-01")).toBe("2026-12-05");
    expect(closingDate({ closing_day: 31, due_day: 8 }, "2026-02-01")).toBe("2026-02-28");
  });
  it("parcela uma compra em faturas consecutivas, somando o total", () => {
    const inst = buildInstallments(card, "2026-11-10", 100000, 3);
    expect(inst.map((i) => i.invoice_month)).toEqual(["2026-12-01", "2027-01-01", "2027-02-01"]);
    expect(inst.reduce((s, i) => s + i.amount, 0)).toBe(100000);
  });
  it("faturas, pagamento e limite", () => {
    const inst: CardInstallment[] = buildInstallments(card, "2026-11-10", 90000, 3).map((i, k) => ({
      ...i, id: `i${k}`, purchase_id: "p1", card_id: "c1",
    }));
    const pay = tx({ kind: "fatura", amount: 30000, paid_date: "2026-12-12", account_id: "a1", card_id: "c1", invoice_month: "2026-12-01" });
    const invs = cardInvoices(card, inst, [pay], "2026-12-13");
    expect(invs).toHaveLength(3);
    expect(invs[0].status).toBe("paga");
    expect(invs[1].status).toBe("aberta");
    expect(invs[2].status).toBe("futura");
    const usage = cardUsage(card, inst, [pay]);
    expect(usage.used).toBe(60000);
    expect(usage.available).toBe(440000);
    const late = cardInvoices(card, inst, [], "2026-12-20");
    expect(late[0].status).toBe("vencida");
    expect(cardInvoices(card, inst, [], "2026-12-07")[0].status).toBe("fechada");
  });
});

describe("contas e lançamentos", () => {
  const a1 = acc();
  const a2 = acc({ id: "a2", initial_balance: 0 });
  const txs = [
    tx({ kind: "receita", amount: 500000, paid_date: "2026-11-05", account_id: "a1" }),
    tx({ kind: "despesa", amount: 20000, paid_date: "2026-11-06", account_id: "a1" }),
    tx({ kind: "despesa", amount: 99999, account_id: null }), // pendente: não mexe no saldo
    tx({ kind: "transferencia", amount: 50000, paid_date: "2026-11-07", account_id: "a1", to_account_id: "a2" }),
    tx({ kind: "fatura", amount: 10000, paid_date: "2026-11-12", account_id: "a2", card_id: "c1", invoice_month: "2026-11-01" }),
  ];
  it("saldo considera só o que foi pago; transferência move entre contas", () => {
    expect(accountBalance(a1, txs)).toBe(100000 + 500000 - 20000 - 50000);
    expect(accountBalance(a2, txs)).toBe(50000 - 10000);
    expect(accountBalance(a1, txs, "2026-11-05")).toBe(600000);
  });
  it("transferência e fatura não são receita nem despesa", () => {
    const data: FinanceData = { ...EMPTY_DATA, accounts: [a1, a2], transactions: txs };
    const t = totals(buildEntries(data));
    expect(t.receitas).toBe(500000);
    expect(t.despesas).toBe(20000 + 99999);
    expect(cashFlow(txs, ["2026-11"])[0]).toEqual({ month: "2026-11", entradas: 500000, saidas: 30000, liquido: 470000 });
  });
  it("extrato com saldo corrente", () => {
    const st = accountStatement(a1, txs);
    expect(st[0].balance).toBe(accountBalance(a1, txs));
  });
  it("situação: pago, pendente, atrasado", () => {
    expect(txStatus({ paid_date: "2026-11-01", due_date: "2026-10-01" }, "2026-11-10")).toBe("pago");
    expect(txStatus({ paid_date: null, due_date: "2026-11-09" }, "2026-11-10")).toBe("atrasado");
    expect(txStatus({ paid_date: null, due_date: "2026-11-10" }, "2026-11-10")).toBe("pendente");
  });
  it("recorrência mensal mantém o dia 31", () => {
    expect(recurrenceDates("2026-01-31", "mensal", 3)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(recurrenceDates("2026-11-01", "semanal", 3)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15"]);
  });
});

describe("compras no cartão no resultado", () => {
  it("cada parcela conta uma vez, e o pagamento da fatura não duplica", () => {
    const purchase: CardPurchase = {
      id: "p1", card_id: "c1", description: "TV", category_id: "cat", total: 90000, installments: 3,
      purchase_date: "2026-11-10", notes: "",
    };
    const inst = buildInstallments(card, purchase.purchase_date, 90000, 3).map((i, k) => ({ ...i, id: `i${k}`, purchase_id: "p1", card_id: "c1" }));
    const pay = tx({ kind: "fatura", amount: 30000, paid_date: "2026-12-12", account_id: "a1", card_id: "c1", invoice_month: "2026-12-01" });
    const data: FinanceData = { ...EMPTY_DATA, accounts: [acc()], cards: [card], purchases: [purchase], installments: inst, transactions: [pay] };
    const entries = buildEntries(data);
    expect(entries.map((e) => e.date)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    expect(totals(entries).despesas).toBe(90000);
    const nov = entries.filter((e) => e.date.startsWith("2026-11"));
    expect(byCategory(nov, [{ id: "cat", name: "Compras", kind: "despesa", parent_id: null, color: "#000" }], "despesa")[0].amount).toBe(30000);
  });
});

describe("empréstimos", () => {
  it("Price: parcela, saldo e taxa implícita", () => {
    const pmt = pricePayment(1000000, 2, 12); // R$ 10.000 a 2% em 12x
    expect(pmt).toBe(94560);
    expect(outstandingBalance(pmt, 2, 12)).toBeCloseTo(1000000, -2);
    expect(outstandingBalance(pmt, 0, 3)).toBe(pmt * 3);
    expect(impliedRate(1000000, 94560, 12)).toBeCloseTo(2, 2);
    expect(pricePayment(1200, 0, 12)).toBe(100);
  });
  it("tabelas Price e SAC zeram o saldo", () => {
    const price = amortizationSchedule(1000000, 2, 12, "price");
    const sac = amortizationSchedule(1000000, 2, 12, "sac");
    expect(price[11].balance).toBe(0);
    expect(sac[11].balance).toBe(0);
    expect(sac[0].payment).toBeGreaterThan(sac[11].payment);
    expect(price.reduce((s, r) => s + r.amortization, 0)).toBe(1000000);
  });
  it("situação do empréstimo a partir das parcelas lançadas", () => {
    const loan: Loan = {
      id: "l1", institution: "Banco", description: "", principal: 1000000, installment_amount: 94560,
      installments_count: 12, monthly_rate: 2, contract_date: "2026-01-01", first_due_date: "2026-02-10", notes: "",
    };
    const txs = Array.from({ length: 12 }, (_, i) =>
      tx({ loan_id: "l1", loan_installment: i + 1, amount: 94560, due_date: addMonths("2026-02-10", i), paid_date: i < 4 ? addMonths("2026-02-10", i) : null, account_id: i < 4 ? "a1" : null }),
    );
    const s = loanStatus(loan, txs, "2026-07-01");
    expect(s.paidCount).toBe(4);
    expect(s.pendingCount).toBe(8);
    expect(s.overdueCount).toBe(1); // vencida em 10/06
    expect(s.balance).toBe(outstandingBalance(94560, 2, 8));
    expect(s.payoffDate).toBe("2027-01-10");
  });
  it("antecipação dá desconto", () => {
    expect(prepaymentValue(10000, 2, 10, 2)).toBeLessThan(20000);
    expect(prepaymentValue(10000, 0, 10, 2)).toBe(20000);
  });
});

describe("planejamento, projeção e inteligência", () => {
  const cats = [
    { id: "ali", name: "Alimentação", kind: "despesa" as const, parent_id: null, color: "#f00" },
    { id: "mer", name: "Mercado", kind: "despesa" as const, parent_id: "ali", color: "#f00" },
    { id: "sal", name: "Salário", kind: "receita" as const, parent_id: null, color: "#0f0" },
  ];
  const data: FinanceData = {
    ...EMPTY_DATA,
    accounts: [acc({ initial_balance: 100000 })],
    categories: cats,
    budgets: [{ id: "b", category_id: "ali", amount: 50000 }],
    transactions: [
      tx({ kind: "despesa", category_id: "mer", amount: 45000, due_date: "2026-11-03", paid_date: "2026-11-03", account_id: "a1" }),
      tx({ kind: "despesa", category_id: "ali", amount: 20000, due_date: "2026-10-03", paid_date: "2026-10-03", account_id: "a1" }),
      tx({ kind: "receita", category_id: "sal", amount: 300000, due_date: "2026-10-05", paid_date: "2026-10-05", account_id: "a1" }),
      tx({ kind: "receita", category_id: "sal", amount: 300000, due_date: "2026-11-25" }),
      tx({ kind: "despesa", amount: 330000, due_date: "2026-11-15", description: "Aluguel" }),
    ],
  };
  it("orçamento soma subcategorias e alerta em 80%", () => {
    const b = budgetStatus(data.budgets, cats, buildEntries(data), "2026-11")[0];
    expect(b.spent).toBe(45000);
    expect(b.level).toBe("alerta");
  });
  it("projeção mostra o ponto mais baixo antes do salário", () => {
    const p = projectBalance(data, "2026-11-10", "2026-11-30");
    expect(p.start).toBe(100000 - 45000 - 20000 + 300000);
    expect(p.min.date).toBe("2026-11-15");
    expect(p.min.saldo).toBe(335000 - 330000);
    expect(p.end).toBe(335000 - 330000 + 300000);
  });
  it("posso gastar? considera os compromissos", () => {
    expect(canISpend(data, "2026-11-10", 1000).verdict).not.toBe("nao");
    expect(canISpend(data, "2026-11-10", 10000).verdict).toBe("nao");
    expect(canISpend(data, "2026-11-10", 1000, "ali").reasons.join(" ")).toMatch(/orçamento/);
  });
  it("análises usam só dados reais", () => {
    const ins = analyze(data, "2026-11-10");
    expect(ins.find((i) => i.id === "top")?.text).toMatch(/Alimentação/);
    expect(ins.find((i) => i.id === "aumento")?.text).toMatch(/Alimentação/);
    expect(ins.find((i) => i.id === "previsao")).toBeTruthy();
    expect(analyze(EMPTY_DATA, "2026-11-10")[0].id).toBe("vazio");
  });
  it("patrimônio desconta dívidas", () => {
    const s = netWorthSeries(data, ["2026-10", "2026-11"], "2026-11-10");
    expect(s[1].ativos).toBe(335000);
    expect(s[1].patrimonio).toBe(335000);
  });
  it("à vista x parcelado", () => {
    const r = cashVsInstallments(96000, 100000, 10, 1); // VP das parcelas a 1% = 94.713
    expect(r.parcela).toBe(10000);
    expect(r.best).toBe("parcelado");
    expect(cashVsInstallments(80000, 100000, 10, 1).best).toBe("avista");
  });
});
