// Inteligência financeira: análises feitas só com os dados cadastrados. Nada é inventado:
// quando não há dados suficientes, a análise diz isso.
import type { FinanceData } from "../types";
import { addDays, addMonths, monthEnd, monthKey, monthLabel, monthStart, type ISODate } from "./dates";
import { formatMoney, formatPct, sum } from "./money";
import {
  allInvoices,
  budgetStatus,
  buildEntries,
  byCategory,
  entriesIn,
  projectBalance,
  recurringExpenses,
  resultByMonth,
  totals,
  type Entry,
} from "./reports";

export interface Insight {
  id: string;
  tone: "positivo" | "alerta" | "perigo" | "info";
  title: string;
  text: string;
}

export function analyze(data: FinanceData, today: ISODate, entries: Entry[] = buildEntries(data)): Insight[] {
  const out: Insight[] = [];
  const month = monthKey(today);
  const from = monthStart(today);
  const to = monthEnd(today);
  const monthEntries = entriesIn(entries, from, to);
  const t = totals(monthEntries);

  if (entries.length === 0) {
    return [
      {
        id: "vazio",
        tone: "info",
        title: "Ainda não há dados para analisar",
        text: "Cadastre suas receitas, despesas e compras no cartão. As análises aparecem aqui com base no que você registrar.",
      },
    ];
  }

  // 1. Onde está gastando mais
  const cats = byCategory(monthEntries, data.categories, "despesa");
  if (cats.length) {
    const top = cats.slice(0, 3).map((c) => `${c.name} (${formatMoney(c.amount)}, ${formatPct(c.pct)})`);
    out.push({
      id: "top",
      tone: "info",
      title: `Onde você mais gasta em ${monthLabel(month)}`,
      text: `${top.join(", ")}. Juntas, somam ${formatPct(sum(cats.slice(0, 3).map((c) => c.pct)))} das despesas do mês.`,
    });
  }

  // 2. Categorias que aumentaram (mês atual x média dos 3 meses anteriores)
  const prevMonths = [1, 2, 3].map((i) => monthKey(addMonths(from, -i)));
  const prevEntries = entries.filter((e) => prevMonths.includes(monthKey(e.date)));
  const monthsWithData = new Set(prevEntries.map((e) => monthKey(e.date))).size;
  if (monthsWithData >= 1) {
    const prevCats = new Map(byCategory(prevEntries, data.categories, "despesa").map((c) => [c.id, c.amount / monthsWithData]));
    const increased = cats
      .map((c) => ({ c, avg: prevCats.get(c.id) ?? 0 }))
      .filter(({ c, avg }) => avg > 0 && c.amount > avg * 1.2 && c.amount - avg >= 5000)
      .sort((a, b) => b.c.amount - b.avg - (a.c.amount - a.avg));
    if (increased.length) {
      out.push({
        id: "aumento",
        tone: "alerta",
        title: "Categorias que aumentaram",
        text: increased
          .slice(0, 3)
          .map(({ c, avg }) => `${c.name}: ${formatMoney(c.amount)} neste mês, contra média de ${formatMoney(Math.round(avg))} (+${formatPct(((c.amount - avg) / avg) * 100)})`)
          .join("; ") + ".",
      });
    }
  }

  // 3. Quanto sobra por mês
  const closed = resultByMonth(entries, prevMonths.slice().reverse()).filter((r) => r.receitas || r.despesas);
  if (closed.length) {
    const avg = Math.round(sum(closed.map((r) => r.saldo)) / closed.length);
    out.push({
      id: "sobra",
      tone: avg >= 0 ? "positivo" : "perigo",
      title: avg >= 0 ? "Quanto sobra por mês" : "Você está gastando mais do que ganha",
      text: `Nos últimos ${closed.length} ${closed.length === 1 ? "mês" : "meses"}, ${avg >= 0 ? "sobraram em média" : "faltaram em média"} ${formatMoney(Math.abs(avg))} por mês. Neste mês, até agora: receitas ${formatMoney(t.receitas)}, despesas ${formatMoney(t.despesas)}.`,
    });
  } else if (t.receitas || t.despesas) {
    out.push({
      id: "sobra",
      tone: t.saldo >= 0 ? "positivo" : "alerta",
      title: "Resultado do mês",
      text: `Receitas ${formatMoney(t.receitas)} e despesas ${formatMoney(t.despesas)}: ${t.saldo >= 0 ? "sobra" : "falta"} de ${formatMoney(Math.abs(t.saldo))}.`,
    });
  }

  // 4. Comprometimento com dívidas (parcelas de empréstimo + faturas que vencem no mês) / receitas do mês
  const loanThisMonth = sum(
    data.transactions.filter((x) => x.loan_id && x.due_date >= from && x.due_date <= to).map((x) => x.amount),
  );
  const invoicesThisMonth = sum(allInvoices(data, today).filter((i) => i.due >= from && i.due <= to).map((i) => i.total));
  const debt = loanThisMonth + invoicesThisMonth;
  if (debt > 0) {
    if (t.receitas > 0) {
      const ratio = (debt / t.receitas) * 100;
      out.push({
        id: "divida",
        tone: ratio > 50 ? "perigo" : ratio > 30 ? "alerta" : "positivo",
        title: "Comprometido com dívidas e cartões",
        text: `${formatPct(ratio)} das receitas do mês (${formatMoney(debt)}: ${formatMoney(invoicesThisMonth)} em faturas e ${formatMoney(loanThisMonth)} em parcelas de empréstimos). ${ratio > 30 ? "Acima de 30% costuma apertar o orçamento." : "Está num nível saudável."}`,
      });
    } else {
      out.push({
        id: "divida",
        tone: "alerta",
        title: "Comprometido com dívidas e cartões",
        text: `${formatMoney(debt)} vencem neste mês, e ainda não há receitas lançadas para o mês.`,
      });
    }
  }

  // 5. O que pode ser reduzido
  const recurring = recurringExpenses(data.transactions, data.categories, today).filter((r) => r.active);
  const budgets = budgetStatus(data.budgets, data.categories, entries, month).filter((b) => b.level !== "ok");
  const reducible: string[] = [];
  for (const b of budgets.slice(0, 3))
    reducible.push(`${b.category?.name ?? "Categoria"} já usou ${formatPct(b.pct)} do orçamento`);
  for (const r of recurring.slice(0, 3)) reducible.push(`${r.description} (${formatMoney(r.amount)} recorrente)`);
  const leisure = cats.filter((c) => /lazer|assinatura|delivery|restaurante|compras/i.test(c.name)).slice(0, 2);
  for (const c of leisure) reducible.push(`${c.name}: ${formatMoney(c.amount)} neste mês`);
  if (reducible.length) {
    out.push({
      id: "reduzir",
      tone: "info",
      title: "Onde dá para economizar",
      text: [...new Set(reducible)].join("; ") + ".",
    });
  }

  // 6. Previsão de saldo no fim do mês
  if (data.accounts.length) {
    const proj = projectBalance(data, today, to);
    out.push({
      id: "previsao",
      tone: proj.end < 0 ? "perigo" : proj.min.saldo < 0 ? "alerta" : "positivo",
      title: "Previsão para o fim do mês",
      text: `Saldo hoje: ${formatMoney(proj.start)}. Com as contas a pagar, a receber e as faturas que vencem até ${to.slice(8)}/${to.slice(5, 7)}, o saldo previsto é ${formatMoney(proj.end)}.${proj.min.saldo < 0 ? ` Atenção: em ${proj.min.date.slice(8)}/${proj.min.date.slice(5, 7)} ele fica negativo (${formatMoney(proj.min.saldo)}).` : ""}`,
    });
  }

  return out;
}

export interface SpendAnswer {
  verdict: "sim" | "cuidado" | "nao";
  title: string;
  reasons: string[];
  free: number;
}

/**
 * "Posso gastar R$ X hoje?" — olha o saldo, tudo o que vence nos próximos 30 dias (contas, faturas,
 * parcelas) e o que está para entrar, e o orçamento da categoria, se houver.
 */
export function canISpend(data: FinanceData, today: ISODate, amount: number, categoryId?: string | null): SpendAnswer {
  const horizon = addDays(today, 30);
  const proj = projectBalance(data, today, horizon);
  const free = proj.min.saldo; // o ponto mais baixo do saldo nos próximos 30 dias
  const entries = buildEntries(data);
  const reasons: string[] = [];
  reasons.push(`Saldo nas contas hoje: ${formatMoney(proj.start)}.`);
  reasons.push(
    `Considerando contas a pagar, a receber e faturas dos próximos 30 dias, o saldo mais baixo previsto é ${formatMoney(free)} (em ${proj.min.date.slice(8)}/${proj.min.date.slice(5, 7)}).`,
  );

  // folga de segurança: 10% das despesas médias mensais dos últimos 3 meses
  const from = addMonths(monthStart(today), -3);
  const prev = entriesIn(entries, from, addDays(monthStart(today), -1)).filter((e) => e.type === "despesa");
  const margin = Math.round(sum(prev.map((e) => e.amount)) / 3 / 10);
  if (margin > 0) reasons.push(`Folga de segurança sugerida: ${formatMoney(margin)} (10% do que você gasta por mês).`);

  let verdict: SpendAnswer["verdict"] = amount <= free - margin ? "sim" : amount <= free ? "cuidado" : "nao";

  if (categoryId) {
    const b = budgetStatus(data.budgets, data.categories, entries, monthKey(today)).find((x) => x.budget.category_id === categoryId);
    if (b) {
      if (amount > b.remaining) {
        reasons.push(
          `Passa do orçamento de ${b.category?.name}: restam ${formatMoney(Math.max(0, b.remaining))} de ${formatMoney(b.budget.amount)}.`,
        );
        if (verdict === "sim") verdict = "cuidado";
      } else {
        reasons.push(`Cabe no orçamento de ${b.category?.name}: restam ${formatMoney(b.remaining)}.`);
      }
    }
  }

  const title =
    verdict === "sim"
      ? `Sim, dá para gastar ${formatMoney(amount)}.`
      : verdict === "cuidado"
        ? `Dá, mas fica apertado.`
        : `Melhor não: faltaria dinheiro para os compromissos.`;
  if (verdict === "nao")
    reasons.push(`Gastando ${formatMoney(amount)}, o saldo chegaria a ${formatMoney(free - amount)} antes da próxima entrada.`);
  return { verdict, title, reasons, free };
}

/** Comparar compra à vista (com desconto) e parcelada, considerando quanto o dinheiro renderia. */
export function cashVsInstallments(cashPrice: number, installmentTotal: number, n: number, yieldPctMonth: number) {
  const r = yieldPctMonth / 100;
  const parcela = Math.round(installmentTotal / n);
  let pv = 0;
  for (let i = 1; i <= n; i++) pv += parcela / Math.pow(1 + r, i);
  pv = Math.round(pv);
  return {
    parcela,
    presentValue: pv,
    best: pv < cashPrice ? ("parcelado" as const) : ("avista" as const),
    difference: Math.abs(cashPrice - pv),
  };
}
