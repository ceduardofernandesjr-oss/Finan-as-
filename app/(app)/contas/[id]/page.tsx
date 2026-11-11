"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Archive, ArrowLeft, ArrowLeftRight, Pencil, Trash2 } from "lucide-react";
import { useFinance } from "@/lib/store";
import { ACCOUNT_TYPE_LABEL } from "@/lib/types";
import { accountBalance, accountStatement } from "@/lib/finance/ledger";
import { formatBR } from "@/lib/finance/dates";
import { sum } from "@/lib/finance/money";
import { PageHeader } from "@/components/shell";
import { Button, Card, EmptyState, IconButton, Money, Segmented, Skeleton } from "@/components/ui";
import { PeriodBar, TxRow, usePeriod } from "@/components/tx-list";
import { useForms } from "@/components/forms/provider";
import { useAction, useFeedback } from "@/components/feedback";

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, update, remove } = useFinance();
  const forms = useForms();
  const { confirm } = useFeedback();
  const { exec } = useAction();
  const p = usePeriod("mes");
  const [filter, setFilter] = useState<"todas" | "entradas" | "saidas" | "transferencias">("todas");

  if (loading) return <Skeleton className="h-96" />;
  const account = data.accounts.find((a) => a.id === id);
  if (!account) return <EmptyState title="Conta não encontrada" action={<Link href="/contas" className="font-medium text-brand-700 dark:text-brand-400">Voltar</Link>} />;

  const statement = accountStatement(account, data.transactions).filter((r) => r.tx.paid_date! >= p.range.from && r.tx.paid_date! <= p.range.to);
  const shown = statement.filter((r) =>
    filter === "todas" ? true : filter === "transferencias" ? r.tx.kind === "transferencia" : filter === "entradas" ? r.effect > 0 : r.effect < 0,
  );
  const inflow = sum(statement.filter((r) => r.effect > 0 && r.tx.kind !== "transferencia").map((r) => r.effect));
  const outflow = -sum(statement.filter((r) => r.effect < 0 && r.tx.kind !== "transferencia").map((r) => r.effect));
  const transfers = sum(statement.filter((r) => r.tx.kind === "transferencia").map((r) => r.effect));
  const balance = accountBalance(account, data.transactions);
  const balanceAtEnd = accountBalance(account, data.transactions, p.range.to);

  const del = async () => {
    const used = data.transactions.some((t) => t.account_id === account.id || t.to_account_id === account.id);
    if (used) {
      const ok = await confirm({
        title: "Esta conta tem movimentações",
        text: "Para não apagar seu histórico, contas com lançamentos não podem ser excluídas. Deseja arquivá-la? Ela some das listas, mas o histórico continua.",
        confirmLabel: "Arquivar",
      });
      if (ok) await exec(() => update("accounts", account.id, { archived: true }), "Conta arquivada");
      return;
    }
    const ok = await confirm({ title: `Excluir ${account.name}?`, danger: true, confirmLabel: "Excluir" });
    if (ok && (await exec(() => remove("accounts", account.id), "Conta excluída"))) router.replace("/contas");
  };

  return (
    <>
      <Link href="/contas" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white">
        <ArrowLeft className="size-4" /> Contas
      </Link>
      <PageHeader
        title={account.name}
        sub={`${ACCOUNT_TYPE_LABEL[account.type]}${account.archived ? " · arquivada" : ""} · saldo inicial ${formatBR(account.created_at?.slice(0, 10))}`}
        actions={
          <>
            <IconButton label="Editar" onClick={() => forms.openAccount(account)}><Pencil className="size-4" /></IconButton>
            <IconButton label={account.archived ? "Reativar" : "Arquivar"} onClick={() => exec(() => update("accounts", account.id, { archived: !account.archived }), account.archived ? "Conta reativada" : "Conta arquivada")}>
              <Archive className="size-4" />
            </IconButton>
            <IconButton label="Excluir" onClick={del} className="hover:text-rose-600"><Trash2 className="size-4" /></IconButton>
            <Button variant="secondary" onClick={() => forms.openTransfer()} icon={<ArrowLeftRight className="size-4" />}>Transferir</Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4 sm:p-4"><p className="text-xs text-slate-500">Saldo atual</p><Money value={balance} colored={balance < 0} className="text-lg font-semibold" /></Card>
        <Card className="p-4 sm:p-4"><p className="text-xs text-slate-500">Entradas no período</p><Money value={inflow} className="text-lg font-semibold text-emerald-600 dark:text-brand-400" /></Card>
        <Card className="p-4 sm:p-4"><p className="text-xs text-slate-500">Saídas no período</p><Money value={outflow} className="text-lg font-semibold text-rose-600" /></Card>
        <Card className="p-4 sm:p-4"><p className="text-xs text-slate-500">Transferências (líquido)</p><Money value={transfers} signed className="text-lg font-semibold" /></Card>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PeriodBar p={p} />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todas", label: "Todas" },
            { value: "entradas", label: "Entradas" },
            { value: "saidas", label: "Saídas" },
            { value: "transferencias", label: "Transferências" },
          ]}
        />
      </div>
      <Card>
        <p className="mb-2 text-xs text-slate-500">Saldo ao fim do período: <Money value={balanceAtEnd} className="font-semibold" /></p>
        {shown.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {shown.map((r) => (
              <TxRow key={r.tx.id} tx={r.tx} footer={<span className="text-xs text-slate-400">saldo: <Money value={r.balance} /></span>} />
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhuma movimentação no período" text="Só aparecem aqui lançamentos pagos ou recebidos nesta conta." />
        )}
      </Card>
    </>
  );
}
