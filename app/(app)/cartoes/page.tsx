"use client";
import Link from "next/link";
import { CreditCard, Plus } from "lucide-react";
import { useFinance } from "@/lib/store";
import { cardInvoices, cardUsage, currentInvoiceMonth } from "@/lib/finance/cards";
import { formatBR, monthKey, monthLabel } from "@/lib/finance/dates";
import { pct, sum } from "@/lib/finance/money";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, EmptyState, Money, Progress, Skeleton } from "@/components/ui";
import { useForms } from "@/components/forms/provider";
import { CardVisual, STATUS_LABEL, STATUS_TONE } from "@/components/card-bits";

export default function CardsPage() {
  const { data, today, loading } = useFinance();
  const forms = useForms();
  const cards = data.cards.filter((c) => !c.archived);
  const archived = data.cards.filter((c) => c.archived);
  const usages = cards.map((c) => cardUsage(c, data.installments, data.transactions));

  return (
    <>
      <PageHeader
        title="Cartões de crédito"
        sub={cards.length ? <>Limite disponível: <Money value={sum(usages.map((u) => u.available))} /> de <Money value={sum(usages.map((u) => u.limit))} /></> : "Faturas, parcelas e limites"}
        actions={
          <>
            <Button variant="secondary" onClick={() => forms.openCard()} icon={<Plus className="size-4" />}>Novo cartão</Button>
            {cards.length > 0 && <Button onClick={() => forms.openPurchase({})} icon={<Plus className="size-4" />}>Nova compra</Button>}
          </>
        }
      />
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : !cards.length ? (
        <Card>
          <EmptyState
            icon={<CreditCard className="size-6" />}
            title="Nenhum cartão cadastrado"
            text="Cadastre seus cartões com limite, fechamento e vencimento. As compras parceladas caem sozinhas em cada fatura."
            action={<Button onClick={() => forms.openCard()} icon={<Plus className="size-4" />}>Cadastrar cartão</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, i) => {
            const u = usages[i];
            const current = currentInvoiceMonth(c, today);
            const invs = cardInvoices(c, data.installments, data.transactions, today);
            const cur = invs.find((x) => x.month === current);
            const pendingClosed = invs.filter((x) => x.month < current && x.remaining > 0);
            return (
              <Link key={c.id} href={`/cartoes/${c.id}`}>
                <Card className="h-full transition duration-200 hover:-translate-y-0.5 hover:ring-slate-300 active:scale-[0.99] dark:hover:ring-[#343a34]">
                  <CardVisual {...c} />
                  <div className="mt-4 space-y-3">
                    <div>
                      <dl className="mb-2 grid grid-cols-3 gap-2">
                        <div><dt className="text-xs text-slate-500 dark:text-slate-400">Limite</dt><dd><Money value={u.limit} className="text-sm font-semibold" /></dd></div>
                        <div><dt className="text-xs text-slate-500 dark:text-slate-400">Usado</dt><dd><Money value={u.used} className="text-sm font-semibold" /></dd></div>
                        <div className="text-right"><dt className="text-xs text-slate-500 dark:text-slate-400">Disponível</dt><dd><Money value={u.available} className="text-sm font-bold text-brand-700 dark:text-brand-400" /></dd></div>
                      </dl>
                      <Progress value={pct(u.used, u.limit)} tone={pct(u.used, u.limit) > 90 ? "red" : pct(u.used, u.limit) > 70 ? "amber" : "navy"} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Fatura de {monthLabel(monthKey(current))}</span>
                      <Money value={cur?.total ?? 0} className="font-semibold" />
                    </div>
                    {pendingClosed.map((inv) => (
                      <div key={inv.month} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-500">
                          {monthLabel(monthKey(inv.month))} <Badge tone={STATUS_TONE[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>
                        </span>
                        <Money value={inv.remaining} className="font-semibold text-rose-600" />
                      </div>
                    ))}
                    <p className="text-xs text-slate-500">
                      Fecha dia {c.closing_day} · vence dia {c.due_day} · melhor dia de compra: {c.closing_day}
                      {cur && <> · próximo vencimento {formatBR(cur.due)}</>}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
      {archived.length > 0 && (
        <p className="mt-6 text-sm text-slate-500">
          Arquivados: {archived.map((c, i) => (
            <span key={c.id}>{i > 0 && ", "}<Link className="underline" href={`/cartoes/${c.id}`}>{c.name}</Link></span>
          ))}
        </p>
      )}
    </>
  );
}
