import { describe, expect, it } from "vitest";
import type { Account, Category, CreditCard, FinanceData, Transaction } from "../lib/types";
import { EMPTY_DATA } from "../lib/types";
import { dicas, extrairData, extrairParcelas, extrairValor, responder, type DraftEntry } from "../lib/finance/assistant";

const HOJE = "2026-11-05"; // quinta-feira

const cat = (id: string, name: string, kind: "receita" | "despesa", parent_id: string | null = null): Category => ({ id, name, kind, parent_id, color: "#000" });
const CATS: Category[] = [
  cat("sal", "Salário", "receita"), cat("serv", "Serviços", "receita"), cat("vend", "Vendas", "receita"), cat("rend", "Rendimentos", "receita"), cat("outrec", "Outras receitas", "receita"),
  cat("mor", "Moradia", "despesa"), cat("ali", "Alimentação", "despesa"), cat("tra", "Transporte", "despesa"), cat("comb", "Combustível", "despesa"),
  cat("sau", "Saúde", "despesa"), cat("edu", "Educação", "despesa"), cat("laz", "Lazer", "despesa"), cat("ass", "Assinaturas", "despesa"),
  cat("imp", "Impostos", "despesa"), cat("comp", "Compras", "despesa"), cat("dom", "Contas domésticas", "despesa"), cat("out", "Outros", "despesa"),
  cat("pet", "Pet", "despesa"),
];
const acc = (id: string, name: string, type: Account["type"] = "corrente", initial_balance = 0): Account => ({ id, name, type, initial_balance, color: "#000", archived: false });
const card = (id: string, name: string, institution: string): CreditCard => ({ id, name, institution, brand: "Visa", limit_amount: 500000, closing_day: 25, due_day: 5, color: "#000", archived: false });
const tx = (p: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2), kind: "despesa", description: "x", amount: 1000, due_date: "2026-10-10", paid_date: null, account_id: null, to_account_id: null,
  category_id: null, payment_method: "", notes: "", recurrence_id: null, recurrence_index: null, recurrence_total: null, parent_id: null, loan_id: null, loan_installment: null,
  card_id: null, invoice_month: null, ...p,
});

function dados(extra: Partial<FinanceData> = {}): FinanceData {
  return {
    ...EMPTY_DATA,
    categories: CATS,
    accounts: [acc("itau", "Itaú", "corrente", 100000), acc("nu", "Nubank", "corrente", 50000), acc("din", "Dinheiro", "dinheiro", 2000)],
    cards: [card("cnu", "Nubank", "Nubank"), card("cinter", "Inter Gold", "Inter")],
    transactions: [tx({ account_id: "itau", paid_date: "2026-10-02", due_date: "2026-10-02" }), tx({ account_id: "itau", paid_date: "2026-10-03", due_date: "2026-10-03" })],
    ...extra,
  };
}
const ctx = (extra: Partial<FinanceData> = {}) => ({ data: dados(extra), today: HOJE });
function um(texto: string, extra: Partial<FinanceData> = {}): DraftEntry {
  const r = responder(texto, ctx(extra));
  if (r.type !== "lancamentos") throw new Error(`esperava lançamento, veio ${r.type} para "${texto}"`);
  expect(r.items.length).toBe(1);
  return r.items[0];
}

describe("valor, data e parcelas", () => {
  it.each([
    ["45", 4500], ["45,90", 4590], ["r$ 1.234,56", 123456], ["1,2 mil", 120000], ["2k", 200000], ["50 reais", 5000], ["3 mil", 300000], ["12.50", 1250], ["1.500", 150000],
  ])("%s → %i centavos", (t, v) => expect(extrairValor(t).valor).toBe(v));
  it("datas relativas e absolutas", () => {
    expect(extrairData("ontem", HOJE, true).date).toBe("2026-11-04");
    expect(extrairData("anteontem", HOJE, true).date).toBe("2026-11-03");
    expect(extrairData("amanha", HOJE, false).date).toBe("2026-11-06");
    expect(extrairData("dia 2", HOJE, true).date).toBe("2026-11-02");
    expect(extrairData("dia 20", HOJE, true).date).toBe("2026-10-20"); // passado: dia 20 ainda não chegou → mês anterior
    expect(extrairData("vence dia 20", HOJE, false).date).toBe("2026-11-20");
    expect(extrairData("vence dia 2", HOJE, false).date).toBe("2026-12-02"); // futuro: já passou → próximo mês
    expect(extrairData("03/11", HOJE, true).date).toBe("2026-11-03");
    expect(extrairData("25/12", HOJE, true).date).toBe("2025-12-25");
    expect(extrairData("31/01/2026", HOJE, true).date).toBe("2026-01-31");
    expect(extrairData("na segunda", HOJE, true).date).toBe("2026-11-02");
    expect(extrairData("2 de outubro", HOJE, true).date).toBe("2026-10-02");
    expect(extrairData("sem data", HOJE, true).date).toBeNull();
  });
  it("parcelas", () => {
    expect(extrairParcelas("em 3x").n).toBe(3);
    expect(extrairParcelas("10 parcelas").n).toBe(10);
    expect(extrairParcelas("em 12 vezes sem juros").n).toBe(12);
    expect(extrairParcelas("a vista").n).toBe(1);
    expect(extrairParcelas("300 reais").n).toBe(1);
  });
});

describe("lançamentos em linguagem natural", () => {
  it("despesa simples com categoria por palavra-chave e conta padrão", () => {
    const d = um("gastei 45,90 no mercado ontem");
    expect(d).toMatchObject({ kind: "despesa", via: "conta", amount: 4590, date: "2026-11-04", paid: true, categoryId: "ali", accountId: "itau", paymentMethod: "Pix", description: "Mercado" });
    expect(d.guessed).toContain("conta");
    expect(d.guessed).not.toContain("categoria");
  });
  it("conta citada pelo nome e forma de pagamento", () => {
    expect(um("paguei 120 de luz no pix pelo nubank")).toMatchObject({ amount: 12000, categoryId: "dom", accountId: "nu", paymentMethod: "Pix", description: "Luz", via: "conta" });
    expect(um("gastei 30 de uber em dinheiro")).toMatchObject({ categoryId: "tra", paymentMethod: "Dinheiro" });
  });
  it("receita", () => {
    expect(um("recebi 3500 de salário dia 5")).toMatchObject({ kind: "receita", amount: 350000, categoryId: "sal", date: "2026-11-05", paid: true, paymentMethod: "" });
    expect(um("caiu o salário de 3.200,00 no itaú")).toMatchObject({ kind: "receita", amount: 320000, categoryId: "sal", accountId: "itau" });
    expect(um("freela 800")).toMatchObject({ kind: "receita", categoryId: "serv" });
    expect(um("vendi a bicicleta por 450")).toMatchObject({ kind: "receita", categoryId: "vend", amount: 45000 });
  });
  it("compra no cartão parcelada", () => {
    expect(um("comprei um tênis de 300 em 3x no cartão inter")).toMatchObject({ via: "cartao", cardId: "cinter", installments: 3, amount: 30000, categoryId: "comp", date: HOJE });
    // parcelado sem citar cartão: vai para cartão e pede para escolher (há 2 cartões)
    const r = responder("geladeira 2.400 em 10x", ctx());
    expect(r.type === "lancamentos" && r.items[0].via).toBe("cartao");
    expect(r.type === "lancamentos" && r.problems.join(" ")).toMatch(/Escolha o cartão/);
    // com um único cartão, usa ele
    expect(um("geladeira 2.400 em 10x", { cards: [card("so", "Visa Platinum", "Banco X")] })).toMatchObject({ cardId: "so", installments: 10 });
  });
  it("conta a pagar no futuro", () => {
    expect(um("conta de internet 99 vence dia 15")).toMatchObject({ kind: "despesa", via: "conta", amount: 9900, date: "2026-11-15", paid: false, categoryId: "dom" });
    expect(um("vou receber 500 amanhã")).toMatchObject({ kind: "receita", paid: false, date: "2026-11-06" });
  });
  it("categoria pelo nome que a pessoa criou tem prioridade", () => {
    expect(um("gastei 80 com pet")).toMatchObject({ categoryId: "pet" });
    expect(um("150 em saúde")).toMatchObject({ categoryId: "sau" });
  });
  it("sem categoria reconhecida vai para Outros e marca para conferir", () => {
    const d = um("gastei 20 com xyz");
    expect(d.categoryId).toBe("out");
    expect(d.guessed).toContain("categoria");
    expect(d.description).toBe("Xyz");
  });
  it("vários lançamentos numa frase", () => {
    const r = responder("almoço 32 e uber 18", ctx());
    expect(r.type).toBe("lancamentos");
    if (r.type !== "lancamentos") return;
    expect(r.items.map((i) => [i.amount, i.categoryId])).toEqual([[3200, "ali"], [1800, "tra"]]);
    const r2 = responder("gastei 50 no mercado, paguei 20 de uber\nrecebi 100 de pix", ctx());
    expect(r2.type === "lancamentos" && r2.items.map((i) => i.kind)).toEqual(["despesa", "despesa", "receita"]);
  });
  it("números de data ou parcela não viram valor", () => {
    expect(um("dia 3 paguei 75 de farmácia")).toMatchObject({ amount: 7500, date: "2026-11-03", categoryId: "sau" });
    expect(um("99 de uber")).toMatchObject({ amount: 9900, categoryId: "tra" });
  });
});

describe("perguntas e dicas", () => {
  const base = () => dados({
    transactions: [
      tx({ kind: "receita", amount: 500000, category_id: "sal", account_id: "itau", due_date: "2026-11-01", paid_date: "2026-11-01" }),
      tx({ amount: 30000, category_id: "ali", account_id: "itau", due_date: "2026-11-02", paid_date: "2026-11-02" }),
      tx({ amount: 12000, category_id: "dom", account_id: "itau", due_date: "2026-11-03", paid_date: "2026-11-03" }),
      tx({ amount: 9000, category_id: "dom", account_id: "itau", due_date: "2026-11-20" }),
      tx({ kind: "receita", amount: 480000, category_id: "sal", account_id: "itau", due_date: "2026-10-01", paid_date: "2026-10-01" }),
      tx({ amount: 250000, category_id: "mor", account_id: "itau", due_date: "2026-10-05", paid_date: "2026-10-05" }),
      tx({ amount: 150000, category_id: "laz", account_id: "itau", due_date: "2026-10-15", paid_date: "2026-10-15" }),
    ],
  });
  it("quanto gastei este mês", () => {
    const r = responder("quanto gastei este mês?", { data: base(), today: HOJE });
    expect(r.type).toBe("resumo");
    if (r.type !== "resumo") return;
    expect(r.title).toMatch(/gastou neste mês/);
    expect(r.lines[0]).toContain("R$ 510,00");
    expect(r.lines[0]).toContain("R$ 420,00 já pagas");
  });
  it("quanto gastei com uma categoria e no mês passado", () => {
    const r = responder("quanto gastei com mercado?", { data: base(), today: HOJE });
    expect(r.type === "resumo" && r.lines[0]).toContain("R$ 300,00 em Alimentação");
    const r2 = responder("quanto gastei mês passado", { data: base(), today: HOJE });
    expect(r2.type === "resumo" && r2.title).toMatch(/outubro/i);
    expect(r2.type === "resumo" && r2.lines[0]).toContain("R$ 4.000,00");
  });
  it("saldo das contas", () => {
    const r = responder("qual o meu saldo?", { data: base(), today: HOJE });
    expect(r.type).toBe("saldo");
    // Itaú: 1000 + 5000 - 300 - 120 + 4800 - 2500 - 1500 = 6380; Nubank 500; Dinheiro 20
    expect(r.type === "saldo" && r.title).toContain("R$ 6.900,00");
  });
  it("posso gastar", () => {
    const r = responder("posso gastar 200 em lazer?", { data: base(), today: HOJE });
    expect(r).toMatchObject({ type: "posso_gastar", amount: 20000, categoryId: "laz" });
    expect(responder("posso gastar?", { data: base(), today: HOJE }).type).toBe("nao_entendi");
  });
  it("dicas usam os dados e incluem 50/30/20 e reserva", () => {
    const tips = dicas({ data: base(), today: HOJE });
    const ids = tips.map((t) => t.id);
    expect(ids).toContain("503020");
    expect(ids).toContain("reserva");
    expect(ids).toContain("orcamento");
    expect(tips.find((t) => t.id === "503020")!.text).toMatch(/essencial/);
    expect(responder("me dá umas dicas", { data: base(), today: HOJE }).type).toBe("dicas");
  });
  it("sem dados, dica explica o que fazer", () => {
    const tips = dicas({ data: { ...EMPTY_DATA, categories: CATS }, today: HOJE });
    expect(tips[0].id).toBe("vazio");
  });
  it("ajuda e frases sem valor", () => {
    expect(responder("ajuda", ctx()).type).toBe("ajuda");
    expect(responder("oi tudo bem", ctx()).type).toBe("nao_entendi");
  });
});
