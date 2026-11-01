"use client";
import { useState, type ReactNode } from "react";
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, CreditCard, MoreVertical, Pencil, Repeat, RotateCcw, Trash2 } from "lucide-react";
import { categoryLabel, useFinance } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import { formatBR, PERIOD_LABEL, periodRange, periodTitle, type Period } from "@/lib/finance/dates";
import { statusLabel, txStatus } from "@/lib/finance/ledger";
import { useAction, useFeedback } from "./feedback";
import { useForms } from "./forms/provider";
import { Badge, Dot, IconButton, Money, Segmented, cx } from "./ui";

export function StatusBadge({ tx }: { tx: Transaction }) {
  const { today } = useFinance();
  const s = txStatus(tx, today);
  return <Badge tone={s === "pago" ? "green" : s === "atrasado" ? "red" : "amber"}>{statusLabel(s, tx.kind)}</Badge>;
}

/** Ações de um lançamento: pagar, desfazer pagamento, editar, excluir (com tratamento de séries). */
export function useTxActions() {
  const { update, remove, removeSeries } = useFinance();
  const forms = useForms();
  const { confirm } = useFeedback();
  const { exec } = useAction();

  const del = async (tx: Transaction) => {
    if (tx.loan_id) {
      const ok = await confirm({
        title: "Parcela de empréstimo",
        text: "As parcelas fazem parte do empréstimo. Para removê-las, exclua o empréstimo em Dívidas. Você pode desfazer o pagamento desta parcela, se precisar.",
        confirmLabel: "Entendi",
      });
      return void ok;
    }
    if (tx.recurrence_id) {
      const choice = await confirm({
        title: "Excluir lançamento recorrente",
        text: "Excluir só este ou também os próximos pendentes da série? Os já pagos continuam no histórico.",
        danger: true,
        choices: [
          { label: "Só este", value: "uma", danger: true },
          { label: "Este e os próximos", value: "serie", danger: true },
        ],
      });
      if (!choice) return;
      await exec(async () => {
        if (choice === "serie") await removeSeries(tx.recurrence_id!, tx.due_date);
        await remove("transactions", tx.id);
      }, "Excluído");
      return;
    }
    const ok = await confirm({
      title: "Excluir lançamento?",
      text: `"${tx.description}" será excluído. Isso não pode ser desfeito.`,
      danger: true,
      confirmLabel: "Excluir",
    });
    if (ok) await exec(() => remove("transactions", tx.id), "Lançamento excluído");
  };

  const unpay = async (tx: Transaction) => {
    const ok = await confirm({
      title: tx.kind === "receita" ? "Desfazer recebimento?" : "Desfazer pagamento?",
      text: "O lançamento volta a ficar pendente e o valor volta para o saldo da conta.",
      confirmLabel: "Desfazer",
    });
    if (ok) await exec(() => update("transactions", tx.id, { paid_date: null }), "Agora está pendente");
  };

  return { del, unpay, edit: forms.editTx, settle: forms.openSettle };
}

function RowMenu({ items }: { items: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconButton label="Ações" onClick={() => setOpen((o) => !o)}>
        <MoreVertical className="size-4" />
      </IconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 animate-in rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-200 dark:bg-navy-800 dark:ring-navy-700">
            {items.map((i) => (
              <button
                key={i.label}
                onClick={() => {
                  setOpen(false);
                  i.onClick();
                }}
                className={cx(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-navy-700",
                  i.danger && "text-rose-600",
                )}
              >
                {i.icon}
                {i.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TxRow({ tx, showDate = true, footer }: { tx: Transaction; showDate?: boolean; footer?: ReactNode }) {
  const { data } = useFinance();
  const a = useTxActions();
  const cat = data.categories.find((c) => c.id === tx.category_id);
  const account = data.accounts.find((x) => x.id === tx.account_id);
  const to = data.accounts.find((x) => x.id === tx.to_account_id);
  const isTransfer = tx.kind === "transferencia";
  const isInvoice = tx.kind === "fatura";
  const sign = tx.kind === "receita" ? 1 : isTransfer ? 0 : -1;
  const items = [];
  if (!tx.paid_date && (tx.kind === "receita" || tx.kind === "despesa"))
    items.push({ label: tx.kind === "receita" ? "Receber" : "Pagar", icon: <Check className="size-4" />, onClick: () => a.settle(tx) });
  if (tx.paid_date && (tx.kind === "receita" || tx.kind === "despesa"))
    items.push({ label: tx.kind === "receita" ? "Desfazer recebimento" : "Desfazer pagamento", icon: <RotateCcw className="size-4" />, onClick: () => a.unpay(tx) });
  if (!isInvoice) items.push({ label: "Editar", icon: <Pencil className="size-4" />, onClick: () => a.edit(tx) });
  items.push({ label: "Excluir", icon: <Trash2 className="size-4" />, onClick: () => a.del(tx), danger: true });

  return (
    <li className="flex items-center gap-3 py-3">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: isTransfer ? "#3150a6" : isInvoice ? "#7c3aed" : cat?.color ?? "#94a3b8" }}
      >
        {isTransfer ? <ArrowLeftRight className="size-4" /> : isInvoice ? <CreditCard className="size-4" /> : <span className="text-sm font-semibold">{(cat?.name ?? tx.description).slice(0, 1).toUpperCase()}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {tx.description}
          {tx.recurrence_id && <Repeat className="size-3 shrink-0 text-slate-400" aria-label="Recorrente" />}
        </p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {showDate && <>{formatBR(tx.paid_date ?? tx.due_date)} · </>}
          {isTransfer ? `${account?.name ?? "?"} → ${to?.name ?? "?"}` : isInvoice ? `Pagamento de fatura · ${account?.name ?? ""}` : `${categoryLabel(data.categories, tx.category_id)}${account ? ` · ${account.name}` : ""}`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Money
          value={sign === 0 ? tx.amount : sign * tx.amount}
          signed={sign !== 0}
          className={cx("text-sm font-semibold", sign > 0 && "text-emerald-600 dark:text-emerald-400", sign < 0 && "text-slate-900 dark:text-slate-100")}
        />
        {(tx.kind === "receita" || tx.kind === "despesa") && <StatusBadge tx={tx} />}
        {footer}
      </div>
      {!tx.paid_date && (tx.kind === "receita" || tx.kind === "despesa") ? (
        <IconButton label={tx.kind === "receita" ? "Receber" : "Pagar"} onClick={() => a.settle(tx)} className="hidden text-emerald-600 sm:inline-flex">
          <Check className="size-4" />
        </IconButton>
      ) : (
        <span className="hidden w-9 sm:block" />
      )}
      <RowMenu items={items} />
    </li>
  );
}

export function TxList({ txs, empty }: { txs: Transaction[]; empty?: ReactNode }) {
  if (!txs.length) return <>{empty}</>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-navy-800">
      {txs.map((t) => (
        <TxRow key={t.id} tx={t} />
      ))}
    </ul>
  );
}

export function usePeriod(initial: Period = "mes") {
  const { today } = useFinance();
  const [period, setPeriod] = useState<Period>(initial);
  const [offset, setOffset] = useState(0);
  const range = periodRange(period, today, offset);
  return { period, setPeriod: (p: Period) => { setPeriod(p); setOffset(0); }, offset, setOffset, range, title: periodTitle(period, range) };
}

export function PeriodBar({ p, periods = ["semana", "mes", "trimestre", "ano"] }: { p: ReturnType<typeof usePeriod>; periods?: Period[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented value={p.period} onChange={p.setPeriod} options={periods.map((x) => ({ value: x, label: PERIOD_LABEL[x] }))} />
      <div className="flex items-center rounded-xl bg-white ring-1 ring-slate-200 dark:bg-navy-900 dark:ring-navy-800">
        <IconButton label="Período anterior" onClick={() => p.setOffset(p.offset - 1)}>
          <ChevronLeft className="size-4" />
        </IconButton>
        <button className="min-w-36 px-1 text-center text-sm font-medium" onClick={() => p.setOffset(0)} title="Voltar para hoje">
          {p.title}
        </button>
        <IconButton label="Próximo período" onClick={() => p.setOffset(p.offset + 1)}>
          <ChevronRight className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

export function CategoryChip({ id }: { id: string | null }) {
  const { data } = useFinance();
  const c = data.categories.find((x) => x.id === id);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
      <Dot color={c?.color ?? "#94a3b8"} />
      {categoryLabel(data.categories, id)}
    </span>
  );
}
