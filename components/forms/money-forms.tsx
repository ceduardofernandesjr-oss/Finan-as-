"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useFinance } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import type { Invoice } from "@/lib/finance/cards";
import { formatBR, monthLabel, monthKey } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { Modal, useAction } from "../feedback";
import { Button, Field, Input, MoneyInput } from "../ui";
import { AccountSelect, validate, zDate, zMoney, zText } from "./fields";

export function TransferForm({ tx, onClose }: { tx?: Transaction; onClose: () => void }) {
  const { data, today, insert, update } = useFinance();
  const { busy, exec } = useAction();
  const active = data.accounts.filter((a) => !a.archived);
  const [f, setF] = useState({
    description: tx?.description ?? "Transferência",
    amount: tx?.amount ?? 0,
    date: tx?.paid_date ?? today,
    from: (tx?.account_id ?? active[0]?.id ?? null) as string | null,
    to: (tx?.to_account_id ?? active[1]?.id ?? null) as string | null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // se o formulário abriu antes de as contas carregarem, preenche quando chegarem
  const filled = useRef(active.length >= 2);
  const a0 = active[0]?.id, a1 = active[1]?.id;
  useEffect(() => {
    if (tx || filled.current || !a0 || !a1) return;
    filled.current = true;
    setF((s) => ({ ...s, from: s.from ?? a0, to: s.to ?? a1 }));
  }, [tx, a0, a1]);
  const schema = z
    .object({ description: zText("a descrição"), amount: zMoney, date: zDate, from: z.string({ message: "Escolha a conta de origem" }), to: z.string({ message: "Escolha a conta de destino" }) })
    .refine((v) => v.from !== v.to, { path: ["to"], message: "Escolha uma conta diferente da origem" });

  const save = async () => {
    const r = validate(schema, f);
    if (!r.ok) return setErrors(r.errors);
    const row = {
      kind: "transferencia" as const,
      description: r.data.description,
      amount: r.data.amount,
      due_date: r.data.date,
      paid_date: r.data.date,
      account_id: r.data.from,
      to_account_id: r.data.to,
    };
    const ok = await exec(() => (tx ? update("transactions", tx.id, row) : insert("transactions", row)), "Transferência salva");
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={tx ? "Editar transferência" : "Transferência entre contas"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      {active.length < 2 && !tx ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Cadastre pelo menos duas contas para transferir entre elas.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor" error={errors.amount} className="sm:col-span-2">
            <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} autoFocus />
          </Field>
          <Field label="De" error={errors.from}>
            <AccountSelect value={f.from} onChange={(v) => setF({ ...f, from: v })} />
          </Field>
          <Field label="Para" error={errors.to}>
            <AccountSelect value={f.to} onChange={(v) => setF({ ...f, to: v })} exclude={f.from} />
          </Field>
          <Field label="Data" error={errors.date}>
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Descrição" error={errors.description}>
            <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={120} />
          </Field>
          <p className="text-xs text-slate-500 sm:col-span-2">Transferências entre suas contas não contam como receita nem como despesa.</p>
        </div>
      )}
    </Modal>
  );
}

/** Pagar / receber um lançamento pendente, no todo ou em parte. */
export function SettleForm({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { data, today, settle } = useFinance();
  const { busy, exec } = useAction();
  const isIncome = tx.kind === "receita";
  const [f, setF] = useState({
    amount: tx.amount,
    date: today,
    account: (tx.account_id ?? data.accounts.find((a) => !a.archived)?.id ?? null) as string | null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const schema = z.object({
    amount: zMoney.max(tx.amount, `No máximo ${formatMoney(tx.amount)}`),
    date: zDate,
    account: z.string({ message: "Escolha a conta" }),
  });
  const save = async () => {
    const r = validate(schema, f);
    if (!r.ok) return setErrors(r.errors);
    const partial = r.data.amount < tx.amount;
    const ok = await exec(
      () => settle(tx.id, r.data.amount, r.data.date, r.data.account),
      partial
        ? `Pagamento parcial registrado. Faltam ${formatMoney(tx.amount - r.data.amount)}.`
        : isIncome ? "Recebimento registrado" : "Pagamento registrado",
    );
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={isIncome ? "Registrar recebimento" : "Registrar pagamento"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant={isIncome ? "success" : "primary"} onClick={save} loading={busy}>
            {isIncome ? "Receber" : "Pagar"}
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-navy-950">
        <p className="font-medium">{tx.description}</p>
        <p className="text-slate-500">
          {formatMoney(tx.amount)} · vence em {formatBR(tx.due_date)}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor" error={errors.amount} hint="Pode ser menor que o total: o restante continua pendente." className="sm:col-span-2">
          <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        </Field>
        <Field label={isIncome ? "Recebido em" : "Pago em"} error={errors.date}>
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Conta" error={errors.account}>
          <AccountSelect value={f.account} onChange={(v) => setF({ ...f, account: v })} />
        </Field>
      </div>
    </Modal>
  );
}

/** Pagamento de fatura: tira o dinheiro da conta, mas não conta como despesa (as compras já contaram). */
export function InvoicePayForm({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { data, today, insert } = useFinance();
  const { busy, exec } = useAction();
  const card = data.cards.find((c) => c.id === invoice.cardId);
  const [f, setF] = useState({
    amount: invoice.remaining,
    date: today,
    account: (data.accounts.find((a) => !a.archived)?.id ?? null) as string | null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const schema = z.object({ amount: zMoney, date: zDate, account: z.string({ message: "Escolha a conta" }) });
  const save = async () => {
    const r = validate(schema, f);
    if (!r.ok) return setErrors(r.errors);
    const ok = await exec(
      () =>
        insert("transactions", {
          kind: "fatura",
          description: `Fatura ${card?.name ?? ""} ${monthLabel(monthKey(invoice.month))}`.trim(),
          amount: r.data.amount,
          due_date: invoice.due,
          paid_date: r.data.date,
          account_id: r.data.account,
          card_id: invoice.cardId,
          invoice_month: invoice.month,
          payment_method: "Fatura",
        }),
      "Pagamento da fatura registrado",
    );
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Pagar fatura"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Registrar pagamento</Button>
        </>
      }
    >
      <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-navy-950">
        <p className="font-medium">
          {card?.name} · fatura de {monthLabel(monthKey(invoice.month))}
        </p>
        <p className="text-slate-500">
          Total {formatMoney(invoice.total)} · pago {formatMoney(invoice.paid)} · vence {formatBR(invoice.due)}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor pago" error={errors.amount} hint="Pagamento parcial é permitido; o restante fica em aberto." className="sm:col-span-2">
          <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        </Field>
        <Field label="Pago em" error={errors.date}>
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Conta" error={errors.account}>
          <AccountSelect value={f.account} onChange={(v) => setF({ ...f, account: v })} />
        </Field>
      </div>
    </Modal>
  );
}
