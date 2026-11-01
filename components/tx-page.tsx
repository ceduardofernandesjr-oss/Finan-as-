"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Plus, Search } from "lucide-react";
import { useFinance } from "@/lib/store";
import { txStatus } from "@/lib/finance/ledger";
import { entriesIn, totals } from "@/lib/finance/reports";
import { sum } from "@/lib/finance/money";
import { PageHeader } from "./shell";
import { PeriodBar, TxList, usePeriod } from "./tx-list";
import { Button, Card, EmptyState, Input, Money, Select, Skeleton } from "./ui";
import { useForms } from "./forms/provider";
import { CategorySelect } from "./forms/fields";

export function TxPage({ kind }: { kind: "receita" | "despesa" }) {
  const { data, entries, today, loading } = useFinance();
  const forms = useForms();
  const p = usePeriod("mes");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"todos" | "pago" | "pendente" | "atrasado">("todos");
  const [category, setCategory] = useState<string | null>(null);
  const [account, setAccount] = useState("");
  const isIncome = kind === "receita";

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const catIds = category ? new Set([category, ...data.categories.filter((c) => c.parent_id === category).map((c) => c.id)]) : null;
    return data.transactions
      .filter((t) => t.kind === kind && t.due_date >= p.range.from && t.due_date <= p.range.to)
      .filter((t) => !term || t.description.toLowerCase().includes(term) || t.notes.toLowerCase().includes(term))
      .filter((t) => status === "todos" || txStatus(t, today) === status)
      .filter((t) => !catIds || (t.category_id && catIds.has(t.category_id)))
      .filter((t) => !account || t.account_id === account)
      .sort((a, b) => b.due_date.localeCompare(a.due_date) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [data, kind, p.range.from, p.range.to, q, status, category, account, today]);

  const total = sum(list.map((t) => t.amount));
  const settled = sum(list.filter((t) => t.paid_date).map((t) => t.amount));
  const cardTotal = isIncome ? 0 : totals(entriesIn(entries, p.range.from, p.range.to).filter((e) => e.source === "cartao")).despesas;

  return (
    <>
      <PageHeader
        title={isIncome ? "Receitas" : "Despesas"}
        sub={isIncome ? "Salários, serviços, vendas, rendimentos e outras entradas" : "Tudo o que sai: contas, compras, impostos..."}
        actions={
          <Button onClick={() => forms.openTx({ kind })} variant={isIncome ? "success" : "primary"} icon={<Plus className="size-4" />}>
            {isIncome ? "Nova receita" : "Nova despesa"}
          </Button>
        }
      />
      <div className="mb-4">
        <PeriodBar p={p} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4 sm:p-4">
          <p className="text-xs text-slate-500">Total {isIncome ? "previsto" : "lançado"}</p>
          <Money value={total} className="text-lg font-semibold" />
        </Card>
        <Card className="p-4 sm:p-4">
          <p className="text-xs text-slate-500">{isIncome ? "Recebido" : "Pago"}</p>
          <Money value={settled} className="text-lg font-semibold text-emerald-600 dark:text-emerald-400" />
        </Card>
        <Card className="p-4 sm:p-4">
          <p className="text-xs text-slate-500">Pendente</p>
          <Money value={total - settled} className="text-lg font-semibold text-amber-600" />
        </Card>
        {!isIncome ? (
          <Link href="/cartoes">
            <Card className="h-full p-4 sm:p-4">
              <p className="text-xs text-slate-500">Compras no cartão</p>
              <Money value={cardTotal} className="text-lg font-semibold text-violet-600 dark:text-violet-400" />
            </Card>
          </Link>
        ) : (
          <Card className="p-4 sm:p-4">
            <p className="text-xs text-slate-500">Lançamentos</p>
            <p className="text-lg font-semibold">{list.length}</p>
          </Card>
        )}
      </div>

      <Card>
        <div className="mb-2 grid gap-2 sm:grid-cols-4">
          <div className="relative sm:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="todos">Todas as situações</option>
            <option value="pago">{isIncome ? "Recebidas" : "Pagas"}</option>
            <option value="pendente">Pendentes</option>
            <option value="atrasado">Atrasadas</option>
          </Select>
          <CategorySelect kind={kind} value={category} onChange={setCategory} emptyLabel="Todas as categorias" rootsOnly />
          <Select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Todas as contas</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </div>
        {loading ? (
          <div className="space-y-3 py-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <TxList
            txs={list}
            empty={
              <EmptyState
                icon={isIncome ? <ArrowUpCircle className="size-6" /> : <ArrowDownCircle className="size-6" />}
                title={isIncome ? "Nenhuma receita aqui" : "Nenhuma despesa aqui"}
                text="Mude o período ou os filtros, ou cadastre um lançamento."
                action={<Button onClick={() => forms.openTx({ kind })} icon={<Plus className="size-4" />}>Cadastrar</Button>}
              />
            }
          />
        )}
      </Card>
    </>
  );
}
