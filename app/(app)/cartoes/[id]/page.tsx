"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Archive, ArrowLeft, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { categoryLabel, useFinance } from "@/lib/store";
import { cardInvoices, cardUsage, currentInvoiceMonth, futureInstallments } from "@/lib/finance/cards";
import { formatBR, monthKey, monthLabel, monthLabelFull } from "@/lib/finance/dates";
import { pct, sum } from "@/lib/finance/money";
import { byCategory, type Entry } from "@/lib/finance/reports";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardTitle, EmptyState, IconButton, Input, Money, Progress, Segmented, Skeleton } from "@/components/ui";
import { CardVisual, STATUS_LABEL, STATUS_TONE } from "@/components/card-bits";
import { CategoryDonut } from "@/components/charts";
import { useForms } from "@/components/forms/provider";
import { useAction, useFeedback } from "@/components/feedback";
import { TxList } from "@/components/tx-list";

export default function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, entries, today, loading, update, remove } = useFinance();
  const forms = useForms();
  const { confirm } = useFeedback();
  const { exec } = useAction();
  const card = data.cards.find((c) => c.id === id);
  const invoices = useMemo(() => (card ? cardInvoices(card, data.installments, data.transactions, today) : []), [card, data, today]);
  const current = card ? currentInvoiceMonth(card, today) : "";
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"fatura" | "futuras" | "compras" | "categorias">("fatura");
  const [q, setQ] = useState("");

  if (loading) return <Skeleton className="h-96" />;
  if (!card) return <EmptyState title="Cartão não encontrado" action={<Link href="/cartoes" className="text-navy-600">Voltar</Link>} />;

  const usage = cardUsage(card, data.installments, data.transactions);
  const selMonth = sel ?? (invoices.find((i) => i.month === current)?.month ?? invoices.at(-1)?.month ?? current);
  const idx = invoices.findIndex((i) => i.month === selMonth);
  const inv = invoices[idx];
  const purchasesById = new Map(data.purchases.map((p) => [p.id, p]));
  const future = futureInstallments(card, data.installments, today);
  const purchases = data.purchases
    .filter((p) => p.card_id === card.id)
    .filter((p) => !q.trim() || p.description.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date));
  const cardEntries: Entry[] = entries.filter((e) => e.card_id === card.id);
  const payments = data.transactions.filter((t) => t.kind === "fatura" && t.card_id === card.id).sort((a, b) => b.paid_date!.localeCompare(a.paid_date!));

  const delPurchase = async (pid: string) => {
    const p = purchasesById.get(pid);
    const ok = await confirm({
      title: "Excluir compra?",
      text: `"${p?.description}" e todas as suas parcelas serão excluídas.`,
      danger: true,
      confirmLabel: "Excluir",
    });
    if (ok) await exec(() => remove("purchases", pid), "Compra excluída");
  };
  const delCard = async () => {
    const ok = await confirm({
      title: `Excluir o cartão ${card.name}?`,
      text: "Todas as compras, parcelas e pagamentos de fatura deste cartão serão excluídos. Se só não usa mais, prefira arquivar.",
      danger: true,
      confirmLabel: "Excluir tudo",
    });
    if (ok && (await exec(() => remove("cards", card.id), "Cartão excluído"))) router.replace("/cartoes");
  };

  return (
    <>
      <Link href="/cartoes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white">
        <ArrowLeft className="size-4" /> Cartões
      </Link>
      <PageHeader
        title={card.name}
        sub={`${card.brand} · fecha dia ${card.closing_day} · vence dia ${card.due_day} · melhor dia de compra: ${card.closing_day}`}
        actions={
          <>
            <IconButton label="Editar cartão" onClick={() => forms.openCard(card)}><Pencil className="size-4" /></IconButton>
            <IconButton label={card.archived ? "Reativar" : "Arquivar"} onClick={() => exec(() => update("cards", card.id, { archived: !card.archived }), card.archived ? "Cartão reativado" : "Cartão arquivado")}>
              <Archive className="size-4" />
            </IconButton>
            <IconButton label="Excluir cartão" onClick={delCard} className="hover:text-rose-600"><Trash2 className="size-4" /></IconButton>
            <Button onClick={() => forms.openPurchase({ cardId: card.id })} icon={<Plus className="size-4" />}>Nova compra</Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4">
          <CardVisual {...card} />
          <Card>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-500">Limite total</p><Money value={usage.limit} className="font-semibold" /></div>
              <div><p className="text-xs text-slate-500">Disponível</p><Money value={usage.available} className="font-semibold text-emerald-600" /></div>
              <div className="col-span-2">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>Comprometido (inclui parcelas futuras)</span>
                  <Money value={usage.used} />
                </div>
                <Progress value={pct(usage.used, usage.limit)} tone="navy" />
              </div>
              <div><p className="text-xs text-slate-500">Parcelas futuras</p><Money value={sum(future.map((f) => f.amount))} className="font-semibold" /></div>
              <div><p className="text-xs text-slate-500">Compras</p><p className="font-semibold">{data.purchases.filter((p) => p.card_id === card.id).length}</p></div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Segmented
            className="mb-4"
            value={tab}
            onChange={setTab}
            options={[
              { value: "fatura", label: "Faturas" },
              { value: "futuras", label: "Parcelas futuras" },
              { value: "compras", label: "Compras" },
              { value: "categorias", label: "Categorias" },
            ]}
          />

          {tab === "fatura" && (
            <Card>
              {invoices.length === 0 ? (
                <EmptyState title="Nenhuma fatura ainda" text="Lance uma compra para ver as faturas." />
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <IconButton label="Fatura anterior" disabled={idx <= 0} onClick={() => setSel(invoices[idx - 1]?.month)}><ChevronLeft className="size-5" /></IconButton>
                    <div className="text-center">
                      <p className="font-semibold">{inv ? monthLabelFull(monthKey(inv.month)) : monthLabelFull(monthKey(selMonth))}</p>
                      {inv && <Badge tone={STATUS_TONE[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>}
                    </div>
                    <IconButton label="Próxima fatura" disabled={idx < 0 || idx >= invoices.length - 1} onClick={() => setSel(invoices[idx + 1]?.month)}><ChevronRight className="size-5" /></IconButton>
                  </div>
                  {inv ? (
                    <>
                      <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-navy-950">
                        <div><p className="text-xs text-slate-500">Total</p><Money value={inv.total} className="font-semibold" /></div>
                        <div><p className="text-xs text-slate-500">Pago</p><Money value={inv.paid} className="font-semibold text-emerald-600" /></div>
                        <div><p className="text-xs text-slate-500">Fecha em</p><p className="font-semibold">{formatBR(inv.closing)}</p></div>
                        <div><p className="text-xs text-slate-500">Vence em</p><p className="font-semibold">{formatBR(inv.due)}</p></div>
                      </div>
                      {inv.remaining > 0 && (
                        <Button className="mb-4 w-full sm:w-auto" onClick={() => forms.openInvoicePay(inv)}>
                          Pagar fatura · <Money value={inv.remaining} />
                        </Button>
                      )}
                      <ul className="divide-y divide-slate-100 dark:divide-navy-800">
                        {inv.items.map((it) => {
                          const p = purchasesById.get(it.purchase_id);
                          return (
                            <li key={it.id} className="flex items-center gap-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{p?.description}{p && p.installments > 1 && <span className="text-slate-500"> · {it.number}/{p.installments}</span>}</p>
                                <p className="text-xs text-slate-500">{p && formatBR(p.purchase_date)} · {categoryLabel(data.categories, p?.category_id)}</p>
                              </div>
                              <Money value={it.amount} className="text-sm font-semibold" />
                              {p && <IconButton label="Editar compra" onClick={() => forms.openPurchase({ purchase: p })}><Pencil className="size-4" /></IconButton>}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <EmptyState title="Fatura sem lançamentos" />
                  )}
                </>
              )}
              {payments.length > 0 && (
                <div className="mt-6">
                  <CardTitle>Pagamentos de fatura</CardTitle>
                  <TxList txs={payments} />
                </div>
              )}
            </Card>
          )}

          {tab === "futuras" && (
            <Card>
              <CardTitle sub="Parcelas que vão cair nas próximas faturas">Parcelas futuras</CardTitle>
              {future.length ? (
                <ul className="divide-y divide-slate-100 dark:divide-navy-800">
                  {Object.entries(
                    future.reduce<Record<string, typeof future>>((acc, i) => ((acc[i.invoice_month] ??= []).push(i), acc), {}),
                  )
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([m, items]) => (
                      <li key={m} className="py-3">
                        <div className="mb-1 flex justify-between text-sm font-semibold">
                          <span className="capitalize">{monthLabel(monthKey(m))}</span>
                          <Money value={sum(items.map((i) => i.amount))} />
                        </div>
                        {items.map((i) => {
                          const p = purchasesById.get(i.purchase_id);
                          return (
                            <p key={i.id} className="flex justify-between text-xs text-slate-500">
                              <span>{p?.description} · {i.number}/{p?.installments}</span>
                              <Money value={i.amount} />
                            </p>
                          );
                        })}
                      </li>
                    ))}
                </ul>
              ) : (
                <EmptyState title="Nenhuma parcela futura" />
              )}
            </Card>
          )}

          {tab === "compras" && (
            <Card>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" placeholder="Buscar compra" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {purchases.length ? (
                <ul className="divide-y divide-slate-100 dark:divide-navy-800">
                  {purchases.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.description}</p>
                        <p className="text-xs text-slate-500">
                          {formatBR(p.purchase_date)} · {p.installments > 1 ? `${p.installments}x` : "à vista"} · {categoryLabel(data.categories, p.category_id)}
                        </p>
                      </div>
                      <Money value={p.total} className="text-sm font-semibold" />
                      <IconButton label="Editar" onClick={() => forms.openPurchase({ purchase: p })}><Pencil className="size-4" /></IconButton>
                      <IconButton label="Excluir" onClick={() => delPurchase(p.id)} className="hover:text-rose-600"><Trash2 className="size-4" /></IconButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nenhuma compra" />
              )}
            </Card>
          )}

          {tab === "categorias" && (
            <Card>
              <CardTitle sub="Todas as compras deste cartão">Gastos por categoria</CardTitle>
              {cardEntries.length ? <CategoryDonut data={byCategory(cardEntries, data.categories, "despesa")} /> : <EmptyState title="Sem compras" />}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
