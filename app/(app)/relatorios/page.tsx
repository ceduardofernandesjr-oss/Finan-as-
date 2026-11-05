"use client";
import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { useFinance } from "@/lib/store";
import { addMonths, formatBR, monthLabel, monthRange, monthStart } from "@/lib/finance/dates";
import { byCategory, cashFlow, entriesIn, netWorthSeries, recurringExpenses, resultByMonth, totals } from "@/lib/finance/reports";
import { cardUsage } from "@/lib/finance/cards";
import { loanStatus } from "@/lib/finance/loans";
import { formatMoney, formatPct, pct, sum } from "@/lib/finance/money";
import { exportExcel, exportPdf } from "@/lib/export";
import { PageHeader } from "@/components/shell";
import { PeriodBar, usePeriod } from "@/components/tx-list";
import { Button, Card, CardTitle, Dot, EmptyState, Money, Progress, Segmented, Skeleton, cx } from "@/components/ui";
import { C, CashFlowChart, CategoryDonut, IncomeExpenseChart, LineMoneyChart } from "@/components/charts";
import { useAction } from "@/components/feedback";

type Tab = "resumo" | "categorias" | "cartoes" | "patrimonio" | "dividas" | "fluxo" | "recorrentes";

function Table({ head, rows, total }: { head: string[]; rows: React.ReactNode[][]; total?: React.ReactNode[] }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-navy-800">
            {head.map((h, i) => <th key={h} className={cx("px-4 py-2 font-medium sm:px-2", i > 0 && "text-right")}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-navy-800">
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={cx("px-4 py-2 sm:px-2", j > 0 && "tabular text-right")}>{c}</td>)}</tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold dark:border-navy-800">{total.map((c, j) => <td key={j} className={cx("px-4 py-2 sm:px-2", j > 0 && "tabular text-right")}>{c}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const { data, entries, today, loading } = useFinance();
  const p = usePeriod("mes");
  const [tab, setTab] = useState<Tab>("resumo");
  const xls = useAction();
  const pdf = useAction();

  if (loading) return <Skeleton className="h-96" />;

  const { from, to } = p.range;
  const periodEntries = entriesIn(entries, from, to);
  const t = totals(periodEntries);
  const months = monthRange(from, to);
  // para períodos curtos, mostramos os últimos 6 meses como comparação
  const chartMonths = months.length >= 3 ? months : monthRange(addMonths(monthStart(to), -5), to);
  const monthly = resultByMonth(entries, chartMonths);
  const expCats = byCategory(periodEntries, data.categories, "despesa");
  const incCats = byCategory(periodEntries, data.categories, "receita");
  const subCats = byCategory(periodEntries, data.categories, "despesa", false);
  const flow = cashFlow(data.transactions, chartMonths);
  const worth = netWorthSeries(data, chartMonths, today);
  const recurring = recurringExpenses(data.transactions, data.categories, today).filter((r) => r.active);

  const cardRows = data.cards.map((c) => {
    const spent = sum(periodEntries.filter((e) => e.card_id === c.id).map((e) => e.amount));
    return { card: c, spent, usage: cardUsage(c, data.installments, data.transactions) };
  }).filter((r) => r.spent > 0 || !r.card.archived);
  const loans = data.loans.map((l) => loanStatus(l, data.transactions, today));
  const loanDebt = sum(loans.map((l) => l.balance));
  const cardDebt = sum(cardRows.map((r) => r.usage.used));
  const monthlyLoan = sum(loans.filter((l) => l.pendingCount).map((l) => l.loan.installment_amount));
  const avgIncome = monthly.length ? sum(monthly.map((m) => m.receitas)) / monthly.length : 0;

  return (
    <>
      <PageHeader
        title="Relatórios"
        sub={`${p.title} · ${formatBR(from)} a ${formatBR(to)}`}
        actions={
          <>
            <Button variant="secondary" loading={xls.busy} icon={<FileSpreadsheet className="size-4" />} onClick={() => xls.exec(() => exportExcel(data, entries, from, to, p.title), "Planilha gerada")}>Excel</Button>
            <Button variant="secondary" loading={pdf.busy} icon={<FileText className="size-4" />} onClick={() => pdf.exec(() => exportPdf(data, entries, from, to, p.title), "PDF gerado")}>PDF</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <PeriodBar p={p} />
        <div className="-mx-4 overflow-x-auto px-4">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "resumo", label: "Resumo" },
              { value: "categorias", label: "Categorias" },
              { value: "cartoes", label: "Cartões" },
              { value: "fluxo", label: "Fluxo de caixa" },
              { value: "patrimonio", label: "Patrimônio" },
              { value: "dividas", label: "Endividamento" },
              { value: "recorrentes", label: "Recorrentes" },
            ]}
          />
        </div>
      </div>

      {tab === "resumo" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardTitle>Resultado do período</CardTitle>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Receitas</dt><dd><Money value={t.receitas} className="font-semibold text-emerald-600 dark:text-brand-400" /></dd></div>
              <div className="flex justify-between"><dt>Despesas</dt><dd><Money value={t.despesas} className="font-semibold text-rose-600" /></dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-navy-800"><dt>Saldo</dt><dd><Money value={t.saldo} colored className="font-semibold" /></dd></div>
              <div className="flex justify-between text-slate-500"><dt>Taxa de economia</dt><dd>{t.receitas ? formatPct(pct(t.saldo, t.receitas), 1) : "—"}</dd></div>
              <div className="flex justify-between text-slate-500"><dt>Já recebido</dt><dd><Money value={t.recebido} /></dd></div>
              <div className="flex justify-between text-slate-500"><dt>Já pago (ou no cartão)</dt><dd><Money value={t.pago} /></dd></div>
            </dl>
          </Card>
          <Card className="lg:col-span-2">
            <CardTitle sub="Receitas e despesas por mês">Comparativo mensal</CardTitle>
            <IncomeExpenseChart data={monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))} />
          </Card>
          <Card className="lg:col-span-3">
            <Table
              head={["Mês", "Receitas", "Despesas", "Saldo", "Variação das despesas"]}
              rows={monthly.map((m, i) => [
                <span key="m" className="capitalize">{monthLabel(m.month)}</span>,
                formatMoney(m.receitas),
                formatMoney(m.despesas),
                <Money key="s" value={m.saldo} colored />,
                i > 0 && monthly[i - 1].despesas ? formatPct(pct(m.despesas - monthly[i - 1].despesas, monthly[i - 1].despesas), 1) : "—",
              ])}
              total={["Total", formatMoney(sum(monthly.map((m) => m.receitas))), formatMoney(sum(monthly.map((m) => m.despesas))), <Money key="t" value={sum(monthly.map((m) => m.saldo))} colored />, ""]}
            />
          </Card>
        </div>
      )}

      {tab === "categorias" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardTitle sub="Inclui compras no cartão">Despesas por categoria</CardTitle>
            {expCats.length ? <CategoryDonut data={expCats} /> : <EmptyState title="Sem despesas no período" />}
          </Card>
          <Card>
            <CardTitle>Receitas por categoria</CardTitle>
            {incCats.length ? <CategoryDonut data={incCats} /> : <EmptyState title="Sem receitas no período" />}
          </Card>
          {subCats.length > 0 && (
            <Card className="lg:col-span-2">
              <CardTitle sub="Detalhe por subcategoria">Despesas detalhadas</CardTitle>
              <Table head={["Categoria", "Valor", "%"]} rows={subCats.map((c) => [<span key="n" className="flex items-center gap-2"><Dot color={c.color} />{c.name}</span>, formatMoney(c.amount), formatPct(c.pct, 1)])} />
            </Card>
          )}
        </div>
      )}

      {tab === "cartoes" && (
        <Card>
          <CardTitle sub="Compras do período (cada parcela no seu mês) e limite comprometido hoje">Gastos por cartão</CardTitle>
          {cardRows.length ? (
            <Table
              head={["Cartão", "Gasto no período", "Comprometido", "Disponível"]}
              rows={cardRows.map((r) => [r.card.name, formatMoney(r.spent), formatMoney(r.usage.used), formatMoney(r.usage.available)])}
              total={["Total", formatMoney(sum(cardRows.map((r) => r.spent))), formatMoney(cardDebt), formatMoney(sum(cardRows.map((r) => r.usage.available)))]}
            />
          ) : (
            <EmptyState title="Nenhum cartão cadastrado" />
          )}
        </Card>
      )}

      {tab === "fluxo" && (
        <div className="grid gap-5">
          <Card>
            <CardTitle sub="Dinheiro que efetivamente entrou e saiu das contas. Pagamentos de fatura contam; transferências entre contas, não.">Fluxo de caixa</CardTitle>
            <CashFlowChart data={flow.map((f) => ({ ...f, label: monthLabel(f.month) }))} />
          </Card>
          <Card>
            <Table
              head={["Mês", "Entradas", "Saídas", "Líquido"]}
              rows={flow.map((f) => [<span key="m" className="capitalize">{monthLabel(f.month)}</span>, formatMoney(f.entradas), formatMoney(f.saidas), <Money key="l" value={f.liquido} colored />])}
              total={["Total", formatMoney(sum(flow.map((f) => f.entradas))), formatMoney(sum(flow.map((f) => f.saidas))), <Money key="t" value={sum(flow.map((f) => f.liquido))} colored />]}
            />
          </Card>
        </div>
      )}

      {tab === "patrimonio" && (
        <div className="grid gap-5">
          <Card>
            <CardTitle sub="Saldo das contas − faturas e parcelas dos cartões − saldo devedor de empréstimos, no fim de cada mês">Evolução patrimonial</CardTitle>
            <LineMoneyChart
              data={worth.map((w) => ({ ...w, label: monthLabel(w.month) }))}
              lines={[
                { key: "patrimonio", name: "Patrimônio", color: C.navy },
                { key: "ativos", name: "Contas", color: C.income },
                { key: "dividas", name: "Dívidas", color: C.expense, dashed: true },
              ]}
            />
          </Card>
          <Card>
            <Table head={["Mês", "Contas", "Dívidas", "Patrimônio"]} rows={worth.map((w) => [<span key="m" className="capitalize">{monthLabel(w.month)}</span>, formatMoney(w.ativos), formatMoney(w.dividas), <Money key="p" value={w.patrimonio} colored />])} />
          </Card>
        </div>
      )}

      {tab === "dividas" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardTitle>Endividamento</CardTitle>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Empréstimos (saldo devedor)</dt><dd><Money value={loanDebt} className="font-semibold" /></dd></div>
              <div className="flex justify-between"><dt>Cartões (comprometido)</dt><dd><Money value={cardDebt} className="font-semibold" /></dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-navy-800"><dt>Total</dt><dd><Money value={loanDebt + cardDebt} className="font-semibold text-rose-600" /></dd></div>
              <div className="flex justify-between text-slate-500"><dt>Parcelas de empréstimo/mês</dt><dd><Money value={monthlyLoan} /></dd></div>
              <div className="flex justify-between text-slate-500"><dt>Receita média mensal</dt><dd><Money value={Math.round(avgIncome)} /></dd></div>
            </dl>
            {avgIncome > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs text-slate-500">Parcelas de empréstimo sobre a receita: {formatPct(pct(monthlyLoan, avgIncome), 1)}</p>
                <Progress value={pct(monthlyLoan, avgIncome) * (100 / 30)} tone={pct(monthlyLoan, avgIncome) > 30 ? "red" : pct(monthlyLoan, avgIncome) > 20 ? "amber" : "green"} />
                <p className="mt-1 text-[11px] text-slate-400">Barra cheia = 30% da receita, limite costumeiro de comprometimento.</p>
              </div>
            )}
          </Card>
          <Card className="lg:col-span-2">
            <CardTitle>Empréstimos</CardTitle>
            {loans.length ? (
              <Table
                head={["Instituição", "Pagas", "Saldo devedor", "Parcela", "Quitação"]}
                rows={loans.map((l) => [l.loan.institution, `${l.paidCount}/${l.loan.installments_count}`, formatMoney(l.balance), formatMoney(l.loan.installment_amount), formatBR(l.payoffDate)])}
              />
            ) : (
              <EmptyState title="Nenhum empréstimo" />
            )}
          </Card>
        </div>
      )}

      {tab === "recorrentes" && (
        <Card>
          <CardTitle sub="Séries de despesas que se repetem e ainda têm ocorrências">Despesas recorrentes</CardTitle>
          {recurring.length ? (
            <Table
              head={["Descrição", "Categoria", "Valor", "Ocorrências", "Próxima"]}
              rows={recurring.map((r) => [r.description, r.category?.name ?? "—", formatMoney(r.amount), `${r.occurrences - r.remaining} feitas · ${r.remaining} por vir`, r.next ? formatBR(r.next) : "—"])}
              total={["Total por ocorrência", "", formatMoney(sum(recurring.map((r) => r.amount))), "", ""]}
            />
          ) : (
            <EmptyState title="Nenhuma despesa recorrente ativa" />
          )}
        </Card>
      )}
    </>
  );
}
