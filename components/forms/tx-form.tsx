"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useFinance } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import { PAYMENT_METHODS } from "@/lib/types";
import { recurrenceDates, FREQUENCY_LABEL, type Frequency } from "@/lib/finance/ledger";
import { formatBR } from "@/lib/finance/dates";
import { Modal, useAction, useFeedback } from "../feedback";
import { Button, Field, Input, MoneyInput, Select, Textarea, Toggle } from "../ui";
import { AccountSelect, CategorySelect, validate, zDate, zMoney, zText } from "./fields";

const schema = z
  .object({
    description: zText("a descrição"),
    amount: zMoney,
    due_date: zDate,
    paid: z.boolean(),
    paid_date: z.string(),
    account_id: z.string().nullable(),
    category_id: z.string().nullable(),
    payment_method: z.string(),
    notes: z.string().max(1000),
    repeat: z.enum(["nao", "semanal", "quinzenal", "mensal", "anual"]),
    times: z.number().int(),
  })
  .superRefine((v, ctx) => {
    if (v.paid && !v.account_id) ctx.addIssue({ code: "custom", path: ["account_id"], message: "Escolha a conta" });
    if (v.paid && !/^\d{4}-\d{2}-\d{2}$/.test(v.paid_date)) ctx.addIssue({ code: "custom", path: ["paid_date"], message: "Informe a data" });
    if (v.repeat !== "nao" && (v.times < 2 || v.times > 120))
      ctx.addIssue({ code: "custom", path: ["times"], message: "Entre 2 e 120 vezes" });
  });

export function TxForm({
  kind,
  tx,
  onClose,
}: {
  kind: "receita" | "despesa";
  tx?: Transaction;
  onClose: () => void;
}) {
  const { data, today, insert, update, updateSeries } = useFinance();
  const { confirm } = useFeedback();
  const { busy, exec } = useAction();
  const editing = !!tx;
  const defaultAccount = data.accounts.find((a) => !a.archived)?.id ?? null;
  const [f, setF] = useState({
    description: tx?.description ?? "",
    amount: tx?.amount ?? 0,
    due_date: tx?.due_date ?? today,
    paid: tx ? !!tx.paid_date : true,
    paid_date: tx?.paid_date ?? today,
    account_id: tx?.account_id ?? defaultAccount,
    category_id: tx?.category_id ?? null,
    payment_method: tx?.payment_method ?? (kind === "despesa" ? "Pix" : ""),
    notes: tx?.notes ?? "",
    repeat: "nao" as "nao" | Frequency,
    times: 12,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // se o formulário abriu antes de as contas carregarem, preenche a conta uma única vez quando chegarem
  const filled = useRef(!!defaultAccount);
  useEffect(() => {
    if (tx || filled.current || !defaultAccount) return;
    filled.current = true;
    setF((s) => (s.account_id ? s : { ...s, account_id: defaultAccount }));
  }, [tx, defaultAccount]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const isIncome = kind === "receita";

  const save = async () => {
    const r = validate(schema, f);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    const v = r.data;
    const base = {
      kind,
      description: v.description,
      amount: v.amount,
      account_id: v.account_id,
      category_id: v.category_id,
      payment_method: v.payment_method,
      notes: v.notes,
    };

    if (editing && tx) {
      let scope: string | false = "uma";
      if (tx.recurrence_id && !tx.paid_date) {
        scope = await confirm({
          title: "Lançamento recorrente",
          text: "Aplicar a mudança só a este ou também aos próximos pendentes desta série? (A data e a situação mudam só neste.)",
          choices: [
            { label: "Só este", value: "uma" },
            { label: "Este e os próximos", value: "serie" },
          ],
        });
        if (!scope) return;
      }
      const ok = await exec(async () => {
        if (scope === "serie" && tx.recurrence_id) {
          await updateSeries(tx.recurrence_id, tx.due_date, {
            description: v.description,
            amount: v.amount,
            category_id: v.category_id,
            payment_method: v.payment_method,
            notes: v.notes,
          });
        }
        await update("transactions", tx.id, {
          ...base,
          due_date: v.due_date,
          paid_date: v.paid ? v.paid_date : null,
        });
      }, "Lançamento atualizado");
      if (ok) onClose();
      return;
    }

    const rows: Partial<Transaction>[] = [];
    if (v.repeat === "nao") {
      rows.push({ ...base, due_date: v.due_date, paid_date: v.paid ? v.paid_date : null });
    } else {
      const recurrence_id = crypto.randomUUID();
      const dates = recurrenceDates(v.due_date, v.repeat, v.times);
      dates.forEach((d, i) =>
        rows.push({
          ...base,
          due_date: d,
          // só a primeira ocorrência pode nascer paga; as próximas ficam como contas a pagar/receber
          paid_date: i === 0 && v.paid ? v.paid_date : null,
          recurrence_id,
          recurrence_index: i + 1,
          recurrence_total: v.times,
        }),
      );
    }
    const ok = await exec(
      () => insert("transactions", rows),
      rows.length > 1 ? `${rows.length} lançamentos criados` : isIncome ? "Receita salva" : "Despesa salva",
    );
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${editing ? "Editar" : "Nova"} ${isIncome ? "receita" : "despesa"}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={isIncome ? "success" : "primary"} onClick={save} loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Valor" error={errors.amount} className="sm:col-span-2">
          <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} autoFocus={!editing} />
        </Field>
        <Field label="Descrição" error={errors.description} className="sm:col-span-2">
          <Input
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder={isIncome ? "Ex.: Salário, Venda, Freela" : "Ex.: Aluguel, Mercado, Luz"}
            maxLength={120}
          />
        </Field>
        <Field label="Categoria">
          <CategorySelect kind={kind} value={f.category_id} onChange={(v) => set("category_id", v)} />
        </Field>
        <Field label={isIncome ? "Conta de destino" : "Conta utilizada"} error={errors.account_id}>
          <AccountSelect value={f.account_id} onChange={(v) => set("account_id", v)} placeholder={f.paid ? "Escolha a conta" : "Definir ao pagar"} />
        </Field>
        <Field label={isIncome ? "Data de recebimento" : "Data de vencimento"} error={errors.due_date}>
          <Input type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} />
        </Field>
        {!isIncome ? (
          <Field label="Forma de pagamento">
            <Select value={f.payment_method} onChange={(e) => set("payment_method", e.target.value)}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="sm:col-span-2">
          <Toggle checked={f.paid} onChange={(v) => set("paid", v)} label={isIncome ? "Já recebi" : "Já paguei"} />
        </div>
        {f.paid && (
          <Field label={isIncome ? "Recebido em" : "Pago em"} error={errors.paid_date}>
            <Input type="date" value={f.paid_date} onChange={(e) => set("paid_date", e.target.value)} />
          </Field>
        )}
        {!editing && (
          <>
            <Field label="Repetir" className={f.paid ? "" : "sm:col-start-1"}>
              <Select value={f.repeat} onChange={(e) => set("repeat", e.target.value as typeof f.repeat)}>
                <option value="nao">Não repetir</option>
                {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((k) => (
                  <option key={k} value={k}>
                    {FREQUENCY_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            {f.repeat !== "nao" && (
              <Field
                label="Quantas vezes"
                error={errors.times}
                hint={`Até ${formatBR(recurrenceDates(f.due_date, f.repeat, Math.max(1, Math.min(120, f.times || 1))).at(-1))}`}
              >
                <Input type="number" min={2} max={120} value={f.times} onChange={(e) => set("times", Number(e.target.value))} />
              </Field>
            )}
          </>
        )}
        {editing && tx?.recurrence_id && (
          <p className="text-xs text-slate-500 sm:col-span-2">
            Parte de uma série recorrente ({tx.recurrence_index}/{tx.recurrence_total}).
          </p>
        )}
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={1000} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
