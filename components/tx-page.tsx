"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Plus, Search } from "lucide-react";
import { useFinance } from "@/lib/store";
import { txStatus } from "@/lib/finance/ledger";
import { entriesIn, totals } from "@/lib/finance/reports";
import { formatMoney, sum } from "@/lib/finance/money";
import { PageHeader } from "./shell";
import { PeriodBar, TxList, usePeriod } from "./tx-list";
import { Button, Card, EmptyState, Input, Money, Select, Skeleton, cx } from "./ui";
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
  // gráfico compacto: soma da lista mostrada por categoria principal (só apresentação; não muda nenhum cálculo)
  const porCategoria = useMemo(() => {
    const raiz = (id: string | null) => {
      const c = id ? data.categories.find((x) => x.id === id) : null;
      return c?.parent_id ? data.categories.find((x) => x.id === c.parent_id) ?? c : c;
    };
    const m = new Map<string, { id: string | null; nome: string; color: string; valor: number }>();
    for (const t of list) {
      const c = raiz(t.category_id);
      const k = c?.id ?? "sem";
      const atual = m.get(k) ?? { id: c?.id ?? null, nome: c?.name ?? "Sem categoria", color: c?.color ?? "#70766d", valor: 0 };
      atual.valor += t.amount;
      m.set(k, atual);
    }
    const tot = sum([...m.values()].map((x) => x.valor)) || 1;
    return [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, 5).map((x) => ({ ...x, pct: (x.valor / tot) * 100 }));
  }, [list, data.categories]);

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

      {/* resumo compacto: um bloco só, dividido */}
      <section aria-label="Resumo" className="mb-4 grid grid-cols-2 overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] ring-1 ring-slate-200/70 sm:grid-cols-4 dark:bg-navy-900 dark:shadow-[var(--shadow-card-dark)] dark:ring-line/50">
        {[
          { label: `Total ${isIncome ? "previsto" : "lançado"}`, value: <Money value={total} />, cls: "" },
          { label: isIncome ? "Recebido" : "Pago", value: <Money value={settled} />, cls: "text-brand-700 dark:text-brand-400" },
          { label: "Pendente", value: <Money value={total - settled} />, cls: "text-amber-700 dark:text-amber-400" },
          isIncome
            ? { label: "Lançamentos", value: <span className="tabular">{list.length}</span>, cls: "" }
            : { label: "Compras no cartão", value: <Money value={cardTotal} />, cls: "text-blue-700 dark:text-blue-300", href: "/cartoes" },
        ].map((x, i) => {
          const corpo = (
            <div className={cx("h-full px-4 py-3.5", i % 2 === 1 && "border-l border-slate-100 dark:border-line", i >= 2 && "border-t border-slate-100 sm:border-t-0 dark:border-line", i === 2 && "sm:border-l")}>
              <p className="text-[13px] text-slate-500 dark:text-slate-400">{x.label}</p>
              <p className={cx("money mt-0.5 text-[19px] font-bold tracking-tight", x.cls)}>{x.value}</p>
            </div>
          );
          return "href" in x && x.href ? <Link key={x.label} href={x.href} className="block transition hover:bg-slate-50 dark:hover:bg-tint/[0.02]">{corpo}</Link> : <div key={x.label}>{corpo}</div>;
        })}
      </section>

      {porCategoria.length > 0 && (
        <section aria-label="Por categoria" className="mb-4 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-slate-200/70 sm:p-5 dark:bg-navy-900 dark:shadow-[var(--shadow-card-dark)] dark:ring-line/50">
          <p className="mb-3 text-[13px] font-medium text-slate-500 dark:text-slate-400">Por categoria · lançamentos da lista</p>
          <ul className="space-y-2.5">
            {porCategoria.map((c) => (
              <li key={c.id ?? "sem"} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="flex min-w-0 items-center gap-2 text-sm"><span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} /><span className="truncate">{c.nome}</span></span>
                <span className="money text-sm font-semibold">{formatMoney(c.valor)} <span className="font-normal text-slate-500 dark:text-slate-400">· {Math.round(c.pct)}%</span></span>
                <span className="col-span-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-tint/[0.06]">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(2, c.pct)}%`, background: c.color }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
