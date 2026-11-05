"use client";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useFinance } from "@/lib/store";
import type { Budget, Category, CategoryKind, Goal, GoalKind, Loan } from "@/lib/types";
import { addMonths, diffDays, formatBR } from "@/lib/finance/dates";
import { impliedRate, loanDueDates, pricePayment } from "@/lib/finance/loans";
import { formatMoney } from "@/lib/finance/money";
import { Modal, useAction } from "../feedback";
import { Button, ColorPicker, Field, Input, MoneyInput, Segmented, Select, Textarea } from "../ui";
import { AccountSelect, CategorySelect, validate, zDate, zMoney, zText } from "./fields";

export function LoanForm({ loan, onClose }: { loan?: Loan; onClose: () => void }) {
  const { data, today, createLoan, update } = useFinance();
  const { busy, exec } = useAction();
  const [f, setF] = useState({
    institution: loan?.institution ?? "",
    description: loan?.description ?? "",
    principal: loan?.principal ?? 0,
    rate: loan ? String(loan.monthly_rate).replace(".", ",") : "",
    count: loan?.installments_count ?? 12,
    installment: loan?.installment_amount ?? 0,
    manualInstallment: !!loan,
    contract_date: loan?.contract_date ?? today,
    first_due_date: loan?.first_due_date ?? addMonths(today, 1),
    paid_count: 0,
    account_id: data.accounts.find((a) => !a.archived)?.id ?? null,
    notes: loan?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const rate = Number(f.rate.replace(",", ".")) || 0;
  const autoInstallment = f.principal > 0 && f.count > 0 ? pricePayment(f.principal, rate, f.count) : 0;
  const installment = f.manualInstallment ? f.installment : autoInstallment;
  const shownRate = f.manualInstallment && installment > 0 && f.principal > 0 ? impliedRate(f.principal, installment, f.count) : rate;

  const schema = z
    .object({
      institution: zText("a instituição", 80),
      description: z.string().max(120),
      principal: zMoney,
      count: z.number().int().min(1, "Mínimo 1").max(600, "Máximo 600"),
      installment: zMoney,
      rate: z.number().min(0).max(99),
      contract_date: zDate,
      first_due_date: zDate,
      paid_count: z.number().int().min(0),
      notes: z.string().max(1000),
    })
    .superRefine((v, ctx) => {
      if (v.paid_count > v.count) ctx.addIssue({ code: "custom", path: ["paid_count"], message: "Mais pagas do que o total" });
    });

  const save = async () => {
    const r = validate(schema, { ...f, installment, rate: shownRate });
    if (!r.ok) return setErrors(r.errors);
    if (r.data.paid_count > 0 && !f.account_id) return setErrors({ account_id: "Escolha a conta das parcelas já pagas" });
    const v = r.data;
    if (loan) {
      const ok = await exec(
        () => update("loans", loan.id, { institution: v.institution, description: v.description, notes: v.notes }),
        "Empréstimo atualizado",
      );
      if (ok) onClose();
      return;
    }
    const category = data.categories.find((c) => c.kind === "despesa" && /empr[eé]stimo|financiamento/i.test(c.name));
    const ok = await exec(
      () =>
        createLoan({
          loan: {
            institution: v.institution,
            description: v.description,
            principal: v.principal,
            installment_amount: v.installment,
            installments_count: v.count,
            monthly_rate: Math.round(v.rate * 10000) / 10000,
            contract_date: v.contract_date,
            first_due_date: v.first_due_date,
            notes: v.notes,
          },
          category_id: category?.id ?? null,
          paid_count: v.paid_count,
          account_id: f.account_id,
          installments: loanDueDates(v.first_due_date, v.count).map((d, i) => ({ number: i + 1, due_date: d, amount: v.installment })),
        }),
      "Empréstimo cadastrado. As parcelas estão em Contas a pagar.",
    );
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={loan ? "Editar empréstimo" : "Novo empréstimo ou financiamento"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Instituição financeira" error={errors.institution}>
          <Input value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} placeholder="Ex.: Caixa, Banco do Brasil" autoFocus maxLength={80} />
        </Field>
        <Field label="Descrição">
          <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: Financiamento do carro" maxLength={120} />
        </Field>
        {loan ? (
          <p className="text-sm text-slate-500 sm:col-span-2">
            Valores e parcelas não mudam depois do cadastro: {formatMoney(loan.principal)} em {loan.installments_count}x de{" "}
            {formatMoney(loan.installment_amount)} ({String(loan.monthly_rate).replace(".", ",")}% a.m.). Para mudar, exclua e cadastre de novo.
          </p>
        ) : (
          <>
            <Field label="Valor contratado" error={errors.principal}>
              <MoneyInput value={f.principal} onChange={(v) => setF({ ...f, principal: v })} />
            </Field>
            <Field label="Juros ao mês (%)" error={errors.rate}>
              <Input inputMode="decimal" value={f.manualInstallment ? String(shownRate).replace(".", ",") : f.rate} disabled={f.manualInstallment} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d,.]/g, "") })} placeholder="Ex.: 1,99" />
            </Field>
            <Field label="Quantidade de parcelas" error={errors.count}>
              <Input type="number" min={1} max={600} value={f.count} onChange={(e) => setF({ ...f, count: Number(e.target.value) })} />
            </Field>
            <Field
              label="Valor da parcela"
              error={errors.installment}
              hint={
                <button type="button" className="text-brand-700 underline dark:text-brand-400" onClick={() => setF({ ...f, manualInstallment: !f.manualInstallment, installment: autoInstallment })}>
                  {f.manualInstallment ? "Calcular pela taxa (Price)" : "Digitar a parcela do contrato"}
                </button>
              }
            >
              {f.manualInstallment ? (
                <MoneyInput value={f.installment} onChange={(v) => setF({ ...f, installment: v })} />
              ) : (
                <Input readOnly value={autoInstallment ? formatMoney(autoInstallment) : ""} placeholder="Calculado automaticamente" />
              )}
            </Field>
            <Field label="Data de contratação" error={errors.contract_date}>
              <Input type="date" value={f.contract_date} onChange={(e) => setF({ ...f, contract_date: e.target.value })} />
            </Field>
            <Field label="1º vencimento" error={errors.first_due_date}>
              <Input type="date" value={f.first_due_date} onChange={(e) => setF({ ...f, first_due_date: e.target.value })} />
            </Field>
            <Field label="Parcelas já pagas" error={errors.paid_count} hint="Para empréstimos em andamento">
              <Input type="number" min={0} max={f.count} value={f.paid_count} onChange={(e) => setF({ ...f, paid_count: Number(e.target.value) })} />
            </Field>
            {f.paid_count > 0 && (
              <Field label="Pagas pela conta" error={errors.account_id}>
                <AccountSelect value={f.account_id} onChange={(v) => setF({ ...f, account_id: v })} />
              </Field>
            )}
            {installment > 0 && f.principal > 0 && (
              <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-900 ring-1 ring-brand-200/70 sm:col-span-2 dark:bg-brand-400/[0.07] dark:text-brand-100 dark:ring-brand-400/15">
                Total a pagar: <strong>{formatMoney(installment * f.count)}</strong> · juros:{" "}
                <strong>{formatMoney(Math.max(0, installment * f.count - f.principal))}</strong> · quitação prevista:{" "}
                <strong>{formatBR(addMonths(f.first_due_date, Math.max(0, f.count - 1)))}</strong>. As parcelas viram contas a pagar.
              </div>
            )}
          </>
        )}
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
        </Field>
      </div>
    </Modal>
  );
}

export function BudgetForm({ budget, onClose }: { budget?: Budget; onClose: () => void }) {
  const { data, insert, update } = useFinance();
  const { busy, exec } = useAction();
  const used = new Set(data.budgets.map((b) => b.category_id));
  const [f, setF] = useState({ category_id: budget?.category_id ?? null as string | null, amount: budget?.amount ?? 0 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const schema = z.object({ category_id: z.string({ message: "Escolha a categoria" }), amount: zMoney });
  const save = async () => {
    const r = validate(schema, f);
    if (!r.ok) return setErrors(r.errors);
    if (!budget && used.has(r.data.category_id)) return setErrors({ category_id: "Essa categoria já tem orçamento" });
    const ok = await exec(() => (budget ? update("budgets", budget.id, r.data) : insert("budgets", r.data)), "Orçamento salvo");
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={budget ? "Editar limite" : "Limite de gastos por categoria"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Categoria" error={errors.category_id} hint="O limite vale para todo mês e inclui as subcategorias.">
          <CategorySelect kind="despesa" value={f.category_id} onChange={(v) => setF({ ...f, category_id: v })} emptyLabel="Escolha a categoria" />
        </Field>
        <Field label="Limite mensal" error={errors.amount}>
          <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        </Field>
      </div>
    </Modal>
  );
}

export const GOAL_LABEL: Record<GoalKind, string> = { reserva: "Reserva de emergência", meta: "Objetivo", compra: "Compra planejada" };

export function GoalForm({ goal, kind, onClose }: { goal?: Goal; kind?: GoalKind; onClose: () => void }) {
  const { insert, update, today, entries } = useFinance();
  const { busy, exec } = useAction();
  const [f, setF] = useState({
    name: goal?.name ?? (kind === "reserva" ? "Reserva de emergência" : ""),
    kind: goal?.kind ?? kind ?? ("meta" as GoalKind),
    target: goal?.target ?? 0,
    saved: goal?.saved ?? 0,
    deadline: goal?.deadline ?? "",
    notes: goal?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // sugestão de reserva: 6x a média de despesas dos últimos 3 meses
  const suggestion = useMemo(() => {
    const from = addMonths(today, -3);
    const total = entries.filter((e) => e.type === "despesa" && e.date >= from && e.date < today).reduce((s, e) => s + e.amount, 0);
    return Math.round((total / 3) * 6);
  }, [entries, today]);
  const schema = z.object({
    name: zText("o nome", 80),
    kind: z.enum(["reserva", "meta", "compra"]),
    target: zMoney,
    saved: z.number().int().min(0),
    deadline: z.string().refine((d) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d), "Data inválida"),
    notes: z.string().max(1000),
  });
  const save = async () => {
    const r = validate(schema, f);
    if (!r.ok) return setErrors(r.errors);
    const row = { ...r.data, deadline: r.data.deadline || null };
    const ok = await exec(() => (goal ? update("goals", goal.id, row) : insert("goals", row)), "Meta salva");
    if (ok) onClose();
  };
  const months = f.deadline ? Math.max(1, Math.ceil(diffDays(f.deadline, today) / 30.44)) : 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={goal ? "Editar meta" : "Nova meta"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented
          className="sm:col-span-2"
          value={f.kind}
          onChange={(k) => setF({ ...f, kind: k })}
          options={(Object.keys(GOAL_LABEL) as GoalKind[]).map((k) => ({ value: k, label: GOAL_LABEL[k] }))}
        />
        <Field label="Nome" error={errors.name} className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Viagem, Notebook novo" maxLength={80} />
        </Field>
        <Field
          label="Valor da meta"
          error={errors.target}
          hint={
            f.kind === "reserva" && suggestion > 0 ? (
              <button type="button" className="text-brand-700 underline dark:text-brand-400" onClick={() => setF({ ...f, target: suggestion })}>
                Usar 6 meses das suas despesas: {formatMoney(suggestion)}
              </button>
            ) : undefined
          }
        >
          <MoneyInput value={f.target} onChange={(v) => setF({ ...f, target: v })} />
        </Field>
        <Field label="Já guardado">
          <MoneyInput value={f.saved} onChange={(v) => setF({ ...f, saved: v })} allowZero />
        </Field>
        <Field label="Prazo (opcional)" error={errors.deadline}>
          <Input type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
        </Field>
        {months > 0 && f.target > f.saved && (
          <p className="self-center text-xs text-slate-500">
            Guardando {formatMoney(Math.ceil((f.target - f.saved) / months))} por mês você chega lá em {months} {months === 1 ? "mês" : "meses"}.
          </p>
        )}
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
        </Field>
      </div>
    </Modal>
  );
}

export function CategoryForm({ category, kind, parentId, onClose }: { category?: Category; kind?: CategoryKind; parentId?: string | null; onClose: () => void }) {
  const { data, insert, update } = useFinance();
  const { busy, exec } = useAction();
  const [f, setF] = useState({
    name: category?.name ?? "",
    kind: category?.kind ?? kind ?? ("despesa" as CategoryKind),
    parent_id: category?.parent_id ?? parentId ?? null,
    color: category?.color ?? "#475569",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const roots = data.categories.filter((c) => c.kind === f.kind && !c.parent_id && c.id !== category?.id);
  const hasChildren = !!category && data.categories.some((c) => c.parent_id === category.id);
  const schema = z.object({ name: zText("o nome", 60), kind: z.enum(["receita", "despesa"]), parent_id: z.string().nullable(), color: z.string() });
  const save = async () => {
    const r = validate(schema, f);
    if (!r.ok) return setErrors(r.errors);
    const ok = await exec(() => (category ? update("categories", category.id, r.data) : insert("categories", r.data)), "Categoria salva");
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={category ? "Editar categoria" : "Nova categoria"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!category && (
          <Segmented
            className="sm:col-span-2"
            value={f.kind}
            onChange={(k) => setF({ ...f, kind: k, parent_id: null })}
            options={[{ value: "despesa", label: "Despesa" }, { value: "receita", label: "Receita" }]}
          />
        )}
        <Field label="Nome" error={errors.name}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus maxLength={60} />
        </Field>
        <Field label="Subcategoria de" hint={hasChildren ? "Esta categoria tem subcategorias" : undefined}>
          <Select value={f.parent_id ?? ""} disabled={hasChildren} onChange={(e) => setF({ ...f, parent_id: e.target.value || null })}>
            <option value="">— (categoria principal)</option>
            {roots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Cor" className="sm:col-span-2">
          <ColorPicker value={f.color} onChange={(c) => setF({ ...f, color: c })} />
        </Field>
      </div>
    </Modal>
  );
}
