"use client";
import { useState } from "react";
import { ChevronDown, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { useFinance } from "@/lib/store";
import { addMonths, formatBR, monthLabel, monthRange, monthStart, monthEnd } from "@/lib/finance/dates";
import { cardUsage } from "@/lib/finance/cards";
import { loanBalanceAt, loanStatus, outstandingBalance } from "@/lib/finance/loans";
import { formatPct, sum } from "@/lib/finance/money";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardTitle, EmptyState, IconButton, Money, Progress, Skeleton, cx } from "@/components/ui";
import { C, LineMoneyChart } from "@/components/charts";
import { TxRow } from "@/components/tx-list";
import { useForms } from "@/components/forms/provider";
import { useAction, useFeedback } from "@/components/feedback";

export default function DebtsPage() {
  const { data, today, loading, remove } = useFinance();
  const forms = useForms();
  const { confirm } = useFeedback();
  const { exec } = useAction();
  const [open, setOpen] = useState<string | null>(null);

  if (loading) return <Skeleton className="h-96" />;

  const statuses = data.loans.map((l) => loanStatus(l, data.transactions, today));
  const loanDebt = sum(statuses.map((s) => s.balance));
  const cards = data.cards.map((c) => ({ card: c, used: cardUsage(c, data.installments, data.transactions).used })).filter((c) => c.used > 0);
  const cardDebt = sum(cards.map((c) => c.used));
  const monthlyInstallments = sum(statuses.filter((s) => s.pendingCount > 0).map((s) => s.loan.installment_amount));

  // evolução: 12 meses para trás e projeção até a quitação (máx. 5 anos)
  const lastPayoff = statuses.reduce((m, s) => (s.payoffDate > m ? s.payoffDate : m), today);
  const end = lastPayoff > addMonths(today, 60) ? addMonths(today, 60) : lastPayoff;
  const months = monthRange(addMonths(monthStart(today), -12), end);
  const evolution = months.map((m) => {
    const date = monthEnd(`${m}-01`);
    const value =
      date <= today
        ? sum(data.loans.map((l) => loanBalanceAt(l, data.transactions, date)))
        : sum(
            statuses.map((s) => {
              const left = s.installments.filter((t) => !t.paid_date && t.due_date > date).length;
              return outstandingBalance(s.loan.installment_amount, Number(s.loan.monthly_rate), left);
            }),
          );
    return { label: monthLabel(m), saldo: value, projetado: date > today ? 1 : 0 };
  });

  const del = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Excluir ${name}?`,
      text: "O empréstimo e todas as suas parcelas (pagas e pendentes) serão excluídos. Os saldos das contas voltam a não considerar as parcelas pagas.",
      danger: true,
      confirmLabel: "Excluir",
    });
    if (ok) await exec(() => remove("loans", id), "Empréstimo excluído");
  };

  return (
    <>
      <PageHeader
        title="Empréstimos e dívidas"
        sub="Financiamentos, empréstimos e o que está comprometido nos cartões"
        actions={<Button onClick={() => forms.openLoan()} icon={<Plus className="size-4" />}>Novo empréstimo</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4 sm:p-4"><p className="text-xs text-slate-500">Total das dívidas</p><Money value={loanDebt + cardDebt} className="text-lg font-semibold text-rose-600" /></Card>
        <Card className="p-4 sm:p-4"><p className="text-xs text-slate-500">Saldo devedor de empréstimos</p><Money value={loanDebt} className="text-lg font-semibold" /></Card>
        <Card className="p-4 sm:p-4"><p className="text-xs text-slate-500">Comprometido nos cartões</p><Money value={cardDebt} className="text-lg font-semibold" /></Card>
        <Card className="p-4 sm:p-4"><p className="text-xs text-slate-500">Parcelas por mês</p><Money value={monthlyInstallments} className="text-lg font-semibold" /></Card>
      </div>

      {data.loans.length > 0 && (
        <Card className="mb-5">
          <CardTitle sub={`Saldo devedor dos empréstimos: 12 meses atrás até ${formatBR(end)} (projeção a partir de hoje)`}>Evolução da dívida</CardTitle>
          <LineMoneyChart data={evolution} lines={[{ key: "saldo", name: "Saldo devedor", color: C.expense }]} />
        </Card>
      )}

      {!data.loans.length ? (
        <Card>
          <EmptyState
            icon={<Landmark className="size-6" />}
            title="Nenhum empréstimo cadastrado"
            text="Cadastre empréstimos e financiamentos: as parcelas viram contas a pagar e o saldo devedor é atualizado a cada pagamento."
            action={<Button onClick={() => forms.openLoan()} icon={<Plus className="size-4" />}>Cadastrar</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {statuses.map((s) => (
            <Card key={s.loan.id}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.loan.institution}{s.loan.description && <span className="font-normal text-slate-500"> · {s.loan.description}</span>}</p>
                  <p className="text-xs text-slate-500">
                    Contratado em {formatBR(s.loan.contract_date)} · <Money value={s.loan.principal} /> em {s.loan.installments_count}x de <Money value={s.loan.installment_amount} /> · {formatPct(Number(s.loan.monthly_rate), 2)} a.m.
                  </p>
                </div>
                {s.overdueCount > 0 && <Badge tone="red">{s.overdueCount} atrasada{s.overdueCount > 1 ? "s" : ""}</Badge>}
                {s.pendingCount === 0 && <Badge tone="green">Quitado</Badge>}
                <IconButton label="Editar" onClick={() => forms.openLoan(s.loan)}><Pencil className="size-4" /></IconButton>
                <IconButton label="Excluir" onClick={() => del(s.loan.id, s.loan.institution)} className="hover:text-rose-600"><Trash2 className="size-4" /></IconButton>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div><p className="text-xs text-slate-500">Saldo devedor</p><Money value={s.balance} className="font-semibold text-rose-600" /></div>
                <div><p className="text-xs text-slate-500">Parcelas pagas</p><p className="font-semibold">{s.paidCount} de {s.loan.installments_count}</p></div>
                <div><p className="text-xs text-slate-500">Pendentes</p><p className="font-semibold">{s.pendingCount}</p></div>
                <div><p className="text-xs text-slate-500">Próximo vencimento</p><p className="font-semibold">{s.nextDue ? formatBR(s.nextDue.due_date) : "—"}</p></div>
                <div><p className="text-xs text-slate-500">Quitação prevista</p><p className="font-semibold">{formatBR(s.payoffDate)}</p></div>
              </div>
              <div className="mt-3">
                <Progress value={s.progress * 100} tone="green" />
                <p className="mt-1 text-xs text-slate-500">
                  Já pago: <Money value={s.paidAmount} /> · juros totais do contrato: <Money value={s.totalInterest} />
                </p>
              </div>
              <button className="mt-3 flex items-center gap-1 text-sm font-medium text-navy-600 dark:text-navy-300" onClick={() => setOpen(open === s.loan.id ? null : s.loan.id)}>
                <ChevronDown className={cx("size-4 transition", open === s.loan.id && "rotate-180")} />
                {open === s.loan.id ? "Ocultar parcelas" : "Ver parcelas"}
              </button>
              {open === s.loan.id && (
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-navy-800">
                  {s.installments.map((t) => <TxRow key={t.id} tx={t} />)}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {cards.length > 0 && (
        <Card className="mt-5">
          <CardTitle sub="Faturas em aberto e parcelas futuras ainda não pagas">Cartões de crédito</CardTitle>
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {cards.map(({ card, used }) => (
              <li key={card.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>{card.name}</span>
                <Money value={used} className="font-semibold" />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
