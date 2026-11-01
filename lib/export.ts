"use client";
// Exportação: Excel (movimentações e resumos), PDF (relatório do período) e backup (JSON).
import type { FinanceData } from "./types";
import { ACCOUNT_TYPE_LABEL } from "./types";
import { categoryLabel } from "./store";
import { formatBR, monthLabel, monthRange, todayISO } from "./finance/dates";
import { formatMoney } from "./finance/money";
import { byCategory, cashFlow, entriesIn, netWorthSeries, resultByMonth, totals, type Entry } from "./finance/reports";
import { accountBalance, txStatus, statusLabel } from "./finance/ledger";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const KIND_LABEL = { receita: "Receita", despesa: "Despesa", transferencia: "Transferência", fatura: "Pagamento de fatura" };

export async function exportExcel(data: FinanceData, entries: Entry[], from: string, to: string, title: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Finanças";
  const today = todayISO();
  const money = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]));
  const cards = new Map(data.cards.map((c) => [c.id, c.name]));

  const styleHeader = (ws: import("exceljs").Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2F6B" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Movimentações (lançamentos)
  const ws = wb.addWorksheet("Movimentações");
  ws.columns = [
    { header: "Data", key: "data", width: 12 },
    { header: "Pago/recebido em", key: "pago", width: 16 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Descrição", key: "desc", width: 36 },
    { header: "Categoria", key: "cat", width: 26 },
    { header: "Conta", key: "conta", width: 18 },
    { header: "Conta destino", key: "destino", width: 18 },
    { header: "Forma de pagamento", key: "forma", width: 18 },
    { header: "Situação", key: "sit", width: 12 },
    { header: "Valor", key: "valor", width: 14, style: { numFmt: money } },
    { header: "Observações", key: "obs", width: 30 },
  ];
  data.transactions
    .filter((t) => t.due_date >= from && t.due_date <= to)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .forEach((t) =>
      ws.addRow({
        data: formatBR(t.due_date),
        pago: t.paid_date ? formatBR(t.paid_date) : "",
        tipo: KIND_LABEL[t.kind],
        desc: t.description,
        cat: t.kind === "receita" || t.kind === "despesa" ? categoryLabel(data.categories, t.category_id) : "",
        conta: t.account_id ? accounts.get(t.account_id) : "",
        destino: t.to_account_id ? accounts.get(t.to_account_id) : "",
        forma: t.payment_method,
        sit: t.kind === "receita" || t.kind === "despesa" ? statusLabel(txStatus(t, today), t.kind) : "",
        valor: (t.kind === "receita" ? 1 : -1) * (t.amount / 100),
        obs: t.notes,
      }),
    );
  styleHeader(ws);

  // Compras no cartão (parcelas do período)
  const wc = wb.addWorksheet("Cartões");
  wc.columns = [
    { header: "Data", key: "data", width: 12 },
    { header: "Cartão", key: "cartao", width: 18 },
    { header: "Descrição", key: "desc", width: 40 },
    { header: "Categoria", key: "cat", width: 26 },
    { header: "Valor", key: "valor", width: 14, style: { numFmt: money } },
  ];
  entriesIn(entries, from, to)
    .filter((e) => e.source === "cartao")
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((e) =>
      wc.addRow({ data: formatBR(e.date), cartao: cards.get(e.card_id ?? "") ?? "", desc: e.description, cat: categoryLabel(data.categories, e.category_id), valor: -e.amount / 100 }),
    );
  styleHeader(wc);

  // Resumo mensal
  const months = monthRange(from, to);
  const wr = wb.addWorksheet("Resumo mensal");
  wr.columns = [
    { header: "Mês", key: "mes", width: 12 },
    { header: "Receitas", key: "r", width: 16, style: { numFmt: money } },
    { header: "Despesas", key: "d", width: 16, style: { numFmt: money } },
    { header: "Saldo", key: "s", width: 16, style: { numFmt: money } },
    { header: "Entradas (caixa)", key: "e", width: 16, style: { numFmt: money } },
    { header: "Saídas (caixa)", key: "o", width: 16, style: { numFmt: money } },
  ];
  const flow = new Map(cashFlow(data.transactions, months).map((f) => [f.month, f]));
  for (const r of resultByMonth(entries, months)) {
    const f = flow.get(r.month)!;
    wr.addRow({ mes: monthLabel(r.month), r: r.receitas / 100, d: r.despesas / 100, s: r.saldo / 100, e: f.entradas / 100, o: f.saidas / 100 });
  }
  styleHeader(wr);

  // Categorias
  const wk = wb.addWorksheet("Categorias");
  wk.columns = [
    { header: "Tipo", key: "t", width: 10 },
    { header: "Categoria", key: "c", width: 28 },
    { header: "Valor", key: "v", width: 16, style: { numFmt: money } },
    { header: "%", key: "p", width: 8 },
  ];
  const periodEntries = entriesIn(entries, from, to);
  for (const type of ["despesa", "receita"] as const)
    for (const c of byCategory(periodEntries, data.categories, type))
      wk.addRow({ t: type === "despesa" ? "Despesa" : "Receita", c: c.name, v: c.amount / 100, p: Math.round(c.pct * 10) / 10 });
  styleHeader(wk);

  // Contas
  const wa = wb.addWorksheet("Contas");
  wa.columns = [
    { header: "Conta", key: "n", width: 24 },
    { header: "Tipo", key: "t", width: 18 },
    { header: "Saldo atual", key: "s", width: 16, style: { numFmt: money } },
  ];
  data.accounts.forEach((a) => wa.addRow({ n: a.name + (a.archived ? " (arquivada)" : ""), t: ACCOUNT_TYPE_LABEL[a.type], s: accountBalance(a, data.transactions) / 100 }));
  styleHeader(wa);

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `financas-${title.replace(/[^\w]+/g, "-")}.xlsx`);
}

export async function exportPdf(data: FinanceData, entries: Entry[], from: string, to: string, title: string) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const navy: [number, number, number] = [27, 47, 107];
  const today = todayISO();
  const periodEntries = entriesIn(entries, from, to);
  const t = totals(periodEntries);

  doc.setFillColor(...navy);
  doc.rect(0, 0, 595, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("Relatório financeiro", 40, 38);
  doc.setFontSize(10);
  doc.text(`${title} · ${formatBR(from)} a ${formatBR(to)} · gerado em ${formatBR(today)}`, 40, 56);
  doc.setTextColor(20, 20, 20);

  const table = (head: string[], body: (string | number)[][], startY?: number, headTitle?: string) => {
    let y = startY ?? ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 80) + 28;
    if (y > 760) {
      doc.addPage();
      y = 50;
    }
    if (headTitle) {
      doc.setFontSize(12);
      doc.text(headTitle, 40, y - 8);
    }
    autoTable(doc, {
      head: [head],
      body,
      startY: y,
      theme: "striped",
      headStyles: { fillColor: navy },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: Object.fromEntries(head.map((h, i) => [i, { halign: /Valor|Receitas|Despesas|Saldo|%|Entradas|Saídas|Patrimônio|Dívidas/.test(h) ? "right" : "left" }])),
      margin: { left: 40, right: 40 },
    });
  };

  table(["Resumo", "Valor"], [
    ["Receitas", formatMoney(t.receitas)],
    ["Despesas (inclui compras no cartão)", formatMoney(t.despesas)],
    ["Saldo do período", formatMoney(t.saldo)],
    ["Saldo atual nas contas", formatMoney(data.accounts.reduce((s, a) => s + accountBalance(a, data.transactions), 0))],
  ], 100, "Resumo");

  const months = monthRange(from, to);
  if (months.length > 1)
    table(["Mês", "Receitas", "Despesas", "Saldo"], resultByMonth(entries, months).map((r) => [monthLabel(r.month), formatMoney(r.receitas), formatMoney(r.despesas), formatMoney(r.saldo)]), undefined, "Comparativo mensal");

  const cats = byCategory(periodEntries, data.categories, "despesa");
  if (cats.length) table(["Categoria", "Valor", "%"], cats.map((c) => [c.name, formatMoney(c.amount), `${c.pct.toFixed(1)}%`]), undefined, "Despesas por categoria");
  const inc = byCategory(periodEntries, data.categories, "receita");
  if (inc.length) table(["Categoria", "Valor", "%"], inc.map((c) => [c.name, formatMoney(c.amount), `${c.pct.toFixed(1)}%`]), undefined, "Receitas por categoria");

  const byCard = new Map<string, number>();
  for (const e of periodEntries) if (e.card_id) byCard.set(e.card_id, (byCard.get(e.card_id) ?? 0) + e.amount);
  if (byCard.size)
    table(["Cartão", "Valor"], [...byCard.entries()].map(([id, v]) => [data.cards.find((c) => c.id === id)?.name ?? "", formatMoney(v)]), undefined, "Gastos por cartão");

  const flow = cashFlow(data.transactions, months);
  table(["Mês", "Entradas", "Saídas", "Saldo"], flow.map((f) => [monthLabel(f.month), formatMoney(f.entradas), formatMoney(f.saidas), formatMoney(f.liquido)]), undefined, "Fluxo de caixa (realizado)");

  const worth = netWorthSeries(data, months, today);
  table(["Mês", "Contas", "Dívidas", "Patrimônio"], worth.map((w) => [monthLabel(w.month), formatMoney(w.ativos), formatMoney(w.dividas), formatMoney(w.patrimonio)]), undefined, "Evolução patrimonial");

  const txs = data.transactions.filter((x) => x.due_date >= from && x.due_date <= to && (x.kind === "receita" || x.kind === "despesa")).sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (txs.length)
    table(
      ["Data", "Descrição", "Categoria", "Situação", "Valor"],
      txs.map((x) => [formatBR(x.due_date), x.description, categoryLabel(data.categories, x.category_id), statusLabel(txStatus(x, today), x.kind), `${x.kind === "receita" ? "" : "-"}${formatMoney(x.amount)}`]),
      undefined,
      "Lançamentos",
    );

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${pages}`, 555, 820, { align: "right" });
  }
  doc.save(`relatorio-${title.replace(/[^\w]+/g, "-")}.pdf`);
}

export function exportBackup(data: FinanceData) {
  const strip = <T extends { user_id?: string }>(rows: T[]) => rows.map(({ user_id: _u, ...r }) => r);
  const payload = {
    app: "financas-pessoais",
    version: 1,
    exported_at: new Date().toISOString(),
    accounts: strip(data.accounts),
    categories: strip(data.categories),
    credit_cards: strip(data.cards),
    loans: strip(data.loans),
    card_purchases: strip(data.purchases),
    card_installments: strip(data.installments),
    transactions: strip(data.transactions),
    budgets: strip(data.budgets),
    goals: strip(data.goals),
  };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `backup-financas-${todayISO()}.json`);
}
