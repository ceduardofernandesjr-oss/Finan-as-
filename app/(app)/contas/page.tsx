"use client";
import Link from "next/link";
import { ArrowLeftRight, Plus, Wallet } from "lucide-react";
import { useFinance } from "@/lib/store";
import { ACCOUNT_TYPE_LABEL } from "@/lib/types";
import { accountBalance } from "@/lib/finance/ledger";
import { sum } from "@/lib/finance/money";
import { PageHeader } from "@/components/shell";
import { Button, Card, EmptyState, Money, Skeleton } from "@/components/ui";
import { useForms } from "@/components/forms/provider";

export default function AccountsPage() {
  const { data, loading } = useFinance();
  const forms = useForms();
  const active = data.accounts.filter((a) => !a.archived);
  const archived = data.accounts.filter((a) => a.archived);
  const balances = new Map(data.accounts.map((a) => [a.id, accountBalance(a, data.transactions)]));
  const total = sum(active.map((a) => balances.get(a.id)!));
  const byType = Object.entries(
    active.reduce<Record<string, number>>((acc, a) => ((acc[a.type] = (acc[a.type] ?? 0) + balances.get(a.id)!), acc), {}),
  );

  return (
    <>
      <PageHeader
        title="Contas e carteiras"
        sub={<>Saldo total: <Money value={total} className="font-semibold text-slate-800 dark:text-white" /></>}
        actions={
          <>
            <Button variant="secondary" onClick={() => forms.openTransfer()} icon={<ArrowLeftRight className="size-4" />}>Transferir</Button>
            <Button onClick={() => forms.openAccount()} icon={<Plus className="size-4" />}>Nova conta</Button>
          </>
        }
      />
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : !active.length ? (
        <Card>
          <EmptyState
            icon={<Wallet className="size-6" />}
            title="Nenhuma conta cadastrada"
            text="Cadastre conta corrente, poupança, carteiras digitais, dinheiro e investimentos com o saldo de hoje."
            action={<Button onClick={() => forms.openAccount()} icon={<Plus className="size-4" />}>Cadastrar conta</Button>}
          />
        </Card>
      ) : (
        <>
          {byType.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {byType.map(([t, v]) => (
                <span key={t} className="rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-slate-200 dark:bg-navy-900 dark:ring-line/60">
                  {ACCOUNT_TYPE_LABEL[t as keyof typeof ACCOUNT_TYPE_LABEL]}: <Money value={v} className="font-semibold" />
                </span>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((a) => {
              const b = balances.get(a.id)!;
              const txs = data.transactions.filter((t) => t.paid_date && (t.account_id === a.id || t.to_account_id === a.id));
              return (
                <Link key={a.id} href={`/contas/${a.id}`}>
                  <Card className="h-full transition duration-200 hover:-translate-y-0.5 hover:ring-slate-300 hover:shadow-lg dark:hover:ring-brand-400/30">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl text-white" style={{ background: a.color }}>
                        <Wallet className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{a.name}</p>
                        <p className="text-xs text-slate-500">{ACCOUNT_TYPE_LABEL[a.type]}</p>
                      </div>
                    </div>
                    <Money value={b} colored={b < 0} className="mt-4 block text-2xl font-semibold tracking-tight" />
                    <p className="mt-1 text-xs text-slate-500">{txs.length} movimentações</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
      {archived.length > 0 && (
        <p className="mt-6 text-sm text-slate-500">
          Arquivadas: {archived.map((a, i) => (
            <span key={a.id}>{i > 0 && ", "}<Link className="underline" href={`/contas/${a.id}`}>{a.name}</Link></span>
          ))}
        </p>
      )}
    </>
  );
}
