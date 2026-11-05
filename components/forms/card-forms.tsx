"use client";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useFinance } from "@/lib/store";
import type { Account, CardPurchase, CreditCard } from "@/lib/types";
import { ACCOUNT_TYPE_LABEL, CARD_BRANDS, type AccountType } from "@/lib/types";
import { buildInstallments, dueDate, invoiceMonthFor } from "@/lib/finance/cards";
import { formatBR, monthKey, monthLabel } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { Modal, useAction } from "../feedback";
import { Button, ColorPicker, Field, Input, MoneyInput, Select, Textarea } from "../ui";
import { CategorySelect, validate, zDate, zMoney, zText } from "./fields";

export function PurchaseForm({ cardId, purchase, onClose }: { cardId?: string; purchase?: CardPurchase; onClose: () => void }) {
  const { data, today, saveCardPurchase } = useFinance();
  const { busy, exec } = useAction();
  const cards = data.cards.filter((c) => !c.archived || c.id === purchase?.card_id);
  const [f, setF] = useState({
    card_id: purchase?.card_id ?? cardId ?? cards[0]?.id ?? "",
    description: purchase?.description ?? "",
    total: purchase?.total ?? 0,
    installments: purchase?.installments ?? 1,
    purchase_date: purchase?.purchase_date ?? today,
    category_id: purchase?.category_id ?? null,
    notes: purchase?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const card = data.cards.find((c) => c.id === f.card_id);
  const preview = useMemo(() => {
    if (!card || !/^\d{4}-\d{2}-\d{2}$/.test(f.purchase_date) || f.total <= 0 || f.installments < 1) return null;
    return buildInstallments(card, f.purchase_date, f.total, Math.min(72, f.installments));
  }, [card, f.purchase_date, f.total, f.installments]);

  const schema = z.object({
    card_id: z.string().min(1, "Escolha o cartão"),
    description: zText("a descrição"),
    total: zMoney,
    installments: z.number().int().min(1, "Mínimo 1").max(72, "Máximo 72 parcelas"),
    purchase_date: zDate,
    category_id: z.string().nullable(),
    notes: z.string().max(1000),
  });

  const save = async () => {
    const r = validate(schema, f);
    if (!r.ok) return setErrors(r.errors);
    if (!card) return;
    const v = r.data;
    const ok = await exec(
      () =>
        saveCardPurchase({
          id: purchase?.id,
          card_id: v.card_id,
          description: v.description,
          category_id: v.category_id,
          total: v.total,
          installments: buildInstallments(card, v.purchase_date, v.total, v.installments),
          purchase_date: v.purchase_date,
          notes: v.notes,
        }),
      purchase ? "Compra atualizada" : "Compra lançada no cartão",
    );
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={purchase ? "Editar compra no cartão" : "Compra no cartão"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy} disabled={!cards.length}>Salvar</Button>
        </>
      }
    >
      {!cards.length ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Cadastre um cartão primeiro, na página Cartões.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor total" error={errors.total} className="sm:col-span-2">
            <MoneyInput value={f.total} onChange={(v) => setF({ ...f, total: v })} autoFocus={!purchase} />
          </Field>
          <Field label="Descrição" error={errors.description} className="sm:col-span-2">
            <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: Geladeira, Farmácia" maxLength={120} />
          </Field>
          <Field label="Cartão" error={errors.card_id}>
            <Select value={f.card_id} onChange={(e) => setF({ ...f, card_id: e.target.value })}>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Parcelas" error={errors.installments}>
            <Select value={f.installments} onChange={(e) => setF({ ...f, installments: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "À vista" : `${n}x${f.total ? ` de ${formatMoney(Math.floor(f.total / n))}` : ""}`}
                </option>
              ))}
              {[30, 36, 48, 60, 72].map((n) => (
                <option key={n} value={n}>{n}x</option>
              ))}
            </Select>
          </Field>
          <Field label="Data da compra" error={errors.purchase_date}>
            <Input type="date" value={f.purchase_date} onChange={(e) => setF({ ...f, purchase_date: e.target.value })} />
          </Field>
          <Field label="Categoria">
            <CategorySelect kind="despesa" value={f.category_id} onChange={(v) => setF({ ...f, category_id: v })} />
          </Field>
          {preview && card && (
            <div className="rounded-xl bg-brand-50 p-3 text-xs text-brand-900 ring-1 ring-brand-200/70 sm:col-span-2 dark:bg-brand-400/[0.07] dark:text-brand-100 dark:ring-brand-400/15">
              {preview.length === 1 ? "Entra" : `A 1ª de ${preview.length} parcelas entra`} na fatura de{" "}
              <strong>{monthLabel(monthKey(preview[0].invoice_month))}</strong>, que vence em{" "}
              <strong>{formatBR(dueDate(card, preview[0].invoice_month))}</strong>
              {preview.length > 1 && (
                <> e a última na de <strong>{monthLabel(monthKey(preview[preview.length - 1].invoice_month))}</strong></>
              )}
              . Melhor dia de compra neste cartão: dia {card.closing_day}.
            </div>
          )}
          <Field label="Observações" className="sm:col-span-2">
            <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

export function CardForm({ card, onClose }: { card?: CreditCard; onClose: () => void }) {
  const { insert, update, today } = useFinance();
  const { busy, exec } = useAction();
  const [f, setF] = useState({
    name: card?.name ?? "",
    institution: card?.institution ?? "",
    brand: card?.brand ?? "Mastercard",
    limit_amount: card?.limit_amount ?? 0,
    closing_day: card?.closing_day ?? 1,
    due_day: card?.due_day ?? 10,
    color: card?.color ?? "#7c3aed",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const schema = z.object({
    name: zText("o nome", 60),
    institution: z.string().max(80),
    brand: z.string(),
    limit_amount: z.number().int().min(0),
    closing_day: z.number().int().min(1, "Dia de 1 a 31").max(31, "Dia de 1 a 31"),
    due_day: z.number().int().min(1, "Dia de 1 a 31").max(31, "Dia de 1 a 31"),
    color: z.string(),
  });
  const save = async () => {
    const r = validate(schema, f);
    if (!r.ok) return setErrors(r.errors);
    const ok = await exec(() => (card ? update("cards", card.id, r.data) : insert("cards", r.data)), card ? "Cartão atualizado" : "Cartão cadastrado");
    if (ok) onClose();
  };
  const sample = { closing_day: f.closing_day || 1, due_day: f.due_day || 1 };
  return (
    <Modal
      open
      onClose={onClose}
      title={card ? "Editar cartão" : "Novo cartão"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do cartão" error={errors.name}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Nubank, Itaú Click" autoFocus maxLength={60} />
        </Field>
        <Field label="Banco ou instituição">
          <Input value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} maxLength={80} />
        </Field>
        <Field label="Bandeira">
          <Select value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })}>
            {CARD_BRANDS.map((b) => <option key={b}>{b}</option>)}
          </Select>
        </Field>
        <Field label="Limite total" error={errors.limit_amount}>
          <MoneyInput value={f.limit_amount} onChange={(v) => setF({ ...f, limit_amount: v })} allowZero />
        </Field>
        <Field label="Dia de fechamento" error={errors.closing_day} hint="Também é o melhor dia de compra">
          <Input type="number" min={1} max={31} value={f.closing_day} onChange={(e) => setF({ ...f, closing_day: Number(e.target.value) })} />
        </Field>
        <Field label="Dia de vencimento" error={errors.due_day}>
          <Input type="number" min={1} max={31} value={f.due_day} onChange={(e) => setF({ ...f, due_day: Number(e.target.value) })} />
        </Field>
        {f.closing_day >= 1 && f.closing_day <= 31 && f.due_day >= 1 && f.due_day <= 31 && (
          <p className="text-xs text-slate-500 sm:col-span-2">
            Exemplo: uma compra hoje entra na fatura que vence em {formatBR(dueDate(sample, invoiceMonthFor(sample, today)))}.
          </p>
        )}
        <Field label="Cor" className="sm:col-span-2">
          <ColorPicker value={f.color} onChange={(c) => setF({ ...f, color: c })} />
        </Field>
      </div>
    </Modal>
  );
}

export function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { insert, update } = useFinance();
  const { busy, exec } = useAction();
  const [f, setF] = useState({
    name: account?.name ?? "",
    type: account?.type ?? ("corrente" as AccountType),
    initial_balance: account?.initial_balance ?? 0,
    negative: (account?.initial_balance ?? 0) < 0,
    color: account?.color ?? "#1e3a8a",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const schema = z.object({ name: zText("o nome", 80), type: z.enum(["corrente", "poupanca", "carteira", "dinheiro", "investimento"]), color: z.string() });
  const save = async () => {
    const r = validate(schema, f);
    if (!r.ok) return setErrors(r.errors);
    const row = { ...r.data, initial_balance: Math.abs(f.initial_balance) * (f.negative ? -1 : 1) };
    const ok = await exec(() => (account ? update("accounts", account.id, row) : insert("accounts", row)), account ? "Conta atualizada" : "Conta cadastrada");
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={account ? "Editar conta" : "Nova conta"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" error={errors.name}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Nubank, Carteira" autoFocus maxLength={80} />
        </Field>
        <Field label="Tipo">
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as AccountType })}>
            {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
              <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Saldo inicial" hint="O saldo da conta no dia em que você começa a usar o app.">
          <MoneyInput value={Math.abs(f.initial_balance)} onChange={(v) => setF({ ...f, initial_balance: v })} allowZero />
        </Field>
        <label className="flex items-center gap-2 self-center text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="size-4 accent-rose-600" checked={f.negative} onChange={(e) => setF({ ...f, negative: e.target.checked })} />
          Saldo negativo (cheque especial)
        </label>
        <Field label="Cor" className="sm:col-span-2">
          <ColorPicker value={f.color} onChange={(c) => setF({ ...f, color: c })} />
        </Field>
      </div>
    </Modal>
  );
}
