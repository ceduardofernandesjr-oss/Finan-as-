"use client";
// Conexões bancárias (Pluggy / Open Finance): conectar, escolher para onde vai cada conta,
// buscar os lançamentos novos e revisar antes de importar.
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, KeyRound, Landmark, PlugZap, RefreshCw, ShieldCheck, Unplug, Wallet, XCircle } from "lucide-react";
import { useFinance } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { accountBalance } from "@/lib/finance/ledger";
import { addMonths, formatBR, monthStart } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { norm } from "@/lib/finance/assistant";
import {
  ajusteSaldoInicial, faturaDoPagamento, montarImportacao, sugerir, sugerirCategoriaBanco,
  type Acao, type BankAccountInfo, type BankTx, type Mapeamento, type Sugestao,
} from "@/lib/finance/bank-sync";
import type { AccountType } from "@/lib/types";
import { PageHeader } from "@/components/shell";
import { Modal, useAction, useFeedback } from "@/components/feedback";
import { AccountSelect, CategorySelect } from "@/components/forms/fields";
import { Badge, Button, Card, CardTitle, EmptyState, Field, Input, Money, Select, Skeleton, Spinner, cx } from "@/components/ui";

interface Status { configured: boolean; allowed: boolean; hasAllowList: boolean; email: string | null }
interface Link { id: string; item_id: string; institution: string; last_sync_at: string | null; created_at?: string }
interface LinkAcc {
  id: string; link_id: string; external_id: string; kind: "conta" | "cartao"; name: string; number: string;
  account_id: string | null; card_id: string | null; sync_from: string; enabled: boolean;
}
interface ItemResp { item: { id: string; institution: string; status: string; lastUpdatedAt: string | null }; accounts: BankAccountInfo[] }

async function api<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error("Sem conexão com o servidor. Verifique sua internet.");
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error ?? "Não consegui falar com o servidor.");
  return j as T;
}

const db = () => supabase();
async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

/** Insere uma linha (RLS: sempre da própria pessoa) e devolve o id criado. */
async function inserir(table: string, row: Record<string, unknown>): Promise<string> {
  const r = await ok(db().from(table).insert(row).select("id").single());
  const id = (r as { id?: string } | null)?.id;
  if (!id) throw new Error("Não consegui salvar. Tente de novo.");
  return id;
}

// ------------------------------------------------------------------ passo a passo

function Configurar({ status }: { status: Status }) {
  const passos: [string, React.ReactNode][] = [
    ["Crie sua conta na Pluggy", <>Em <b>dashboard.pluggy.ai</b>. Você ganha um período de teste grátis (cerca de 15 dias): faça os passos 4 e 5 dentro dele.</>],
    ["Pegue as chaves", <>No painel, em <b>Applications</b>, crie uma aplicação e copie o <b>Client ID</b> e o <b>Client Secret</b>.</>],
    ["Cadastre as chaves na Vercel", <>Projeto → Settings → Environment Variables: <code>PLUGGY_CLIENT_ID</code>, <code>PLUGGY_CLIENT_SECRET</code> e <code>PLUGGY_ALLOWED_EMAILS</code> (seu e-mail de login{status.email ? `: ${status.email}` : ""}). Depois faça <b>Redeploy</b>.</>],
    ["Conecte seus bancos no Meu Pluggy", <>Em <b>meu.pluggy.ai</b>, crie a conta e conecte cada banco pelo Open Finance. É gratuito para uso pessoal.</>],
    ["Libere o Meu Pluggy para a sua aplicação", <>No painel da Pluggy, adicione o conector <b>MeuPluggy</b> à aplicação, abra a aplicação de demonstração, autorize o MeuPluggy (uma vez por banco) e copie o <b>Item ID</b> de cada conexão.</>],
    ["Cole o Item ID aqui", <>Em “Conectar banco”, cole o Item ID, escolha para onde vai cada conta e sincronize.</>],
  ];
  return (
    <Card className="mb-5">
      <CardTitle sub="Uma vez só. As chaves ficam no servidor, nunca no navegador.">Como ligar seus bancos</CardTitle>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", status.configured ? "bg-brand-50 text-brand-700 dark:bg-brand-400/10 dark:text-brand-300" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300")}>
          {status.configured ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />} Chaves da Pluggy {status.configured ? "cadastradas" : "não cadastradas"}
        </span>
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", status.allowed ? "bg-brand-50 text-brand-700 dark:bg-brand-400/10 dark:text-brand-300" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300")}>
          {status.allowed ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />} Seu e-mail {status.allowed ? "liberado" : "não liberado"}
        </span>
      </div>
      <ol className="space-y-3">
        {passos.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-400 text-xs font-bold text-navy-950">{i + 1}</span>
            <div className="min-w-0 text-sm">
              <p className="font-medium">{t}</p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:text-[12px] dark:[&_code]:bg-white/[0.08]">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ------------------------------------------------------------------ mapear contas

type Destino = string; // "nova" | "nao" | "acc:<id>" | "card:<id>"

function Mapear({
  resp, link, maps, onClose, onSaved,
}: { resp: ItemResp; link: Link | null; maps: LinkAcc[]; onClose: () => void; onSaved: () => void }) {
  const { data, today, reload } = useFinance();
  const { busy, exec } = useAction();
  const inicial = (a: BankAccountInfo): Destino => {
    const m = maps.find((x) => x.external_id === a.id);
    if (m) return !m.enabled ? "nao" : m.account_id ? `acc:${m.account_id}` : m.card_id ? `card:${m.card_id}` : "nova";
    const nome = norm(a.name);
    if (a.kind === "conta") {
      const igual = data.accounts.find((x) => !x.archived && norm(x.name) === nome);
      return igual ? `acc:${igual.id}` : "nova";
    }
    const igual = data.cards.find((x) => !x.archived && (norm(x.name) === nome || norm(x.institution) === norm(resp.item.institution)));
    return igual ? `card:${igual.id}` : "nova";
  };
  const [dest, setDest] = useState<Record<string, Destino>>(() => Object.fromEntries(resp.accounts.map((a) => [a.id, inicial(a)])));
  const [desde, setDesde] = useState(maps[0]?.sync_from ?? addMonths(monthStart(today), -1));

  const salvar = () =>
    exec(async () => {
      let linkId = link?.id;
      if (!linkId) {
        const existentes = await ok(db().from("bank_links").select("*").eq("item_id", resp.item.id));
        const ja = ((existentes ?? []) as Link[]).find((l) => l.item_id === resp.item.id);
        linkId = ja?.id ?? await inserir("bank_links", { item_id: resp.item.id, institution: resp.item.institution });
      }
      for (const a of resp.accounts) {
        const d = dest[a.id];
        let account_id: string | null = null;
        let card_id: string | null = null;
        if (d === "nova" && a.kind === "conta") {
          const type: AccountType = /SAVINGS/i.test(a.subtype) ? "poupanca" : "corrente";
          account_id = await inserir("accounts", { name: `${resp.item.institution} ${a.name}`.slice(0, 80), type, initial_balance: 0, color: "#b7f000" });
        } else if (d === "nova") {
          card_id = await inserir("credit_cards", {
            name: a.name.slice(0, 60), institution: resp.item.institution.slice(0, 60), brand: "Outra", limit_amount: Math.max(0, a.creditLimit ?? 0),
            closing_day: a.closingDay ?? 1, due_day: a.dueDay ?? 10, color: "#7c3aed",
          });
        } else if (d.startsWith("acc:")) account_id = d.slice(4);
        else if (d.startsWith("card:")) card_id = d.slice(5);
        const row = { link_id: linkId, external_id: a.id, kind: a.kind, name: a.name, number: a.number, account_id, card_id, sync_from: desde, enabled: d !== "nao" };
        const atual = maps.find((m) => m.external_id === a.id);
        if (atual) await ok(db().from("bank_link_accounts").update(row).eq("id", atual.id));
        else await ok(db().from("bank_link_accounts").insert(row));
      }
      await reload();
    }, "Contas do banco ligadas ao app").then((done) => done && onSaved());

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${resp.item.institution}: para onde vai cada conta?`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={salvar}>Salvar</Button></>}
    >
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Os lançamentos de cada conta do banco entram na conta ou no cartão escolhido aqui. Nada é importado sem você revisar.</p>
      <ul className="space-y-3">
        {resp.accounts.map((a) => (
          <li key={a.id} className="rounded-2xl p-3 ring-1 ring-slate-200 dark:ring-white/10">
            <div className="mb-2 flex items-center gap-2">
              {a.kind === "cartao" ? <CreditCard className="size-4 text-violet-500" /> : <Wallet className="size-4 text-brand-600 dark:text-brand-400" />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}{a.number ? ` · ${a.number}` : ""}</span>
              <span className="text-xs text-slate-500">{a.kind === "cartao" ? "fatura" : "saldo"} <Money value={a.balance} className="font-semibold" /></span>
            </div>
            <Select aria-label={`Destino de ${a.name}`} value={dest[a.id]} onChange={(e) => setDest({ ...dest, [a.id]: e.target.value })}>
              <option value="nova">{a.kind === "cartao" ? "Criar cartão novo no app" : "Criar conta nova no app"}</option>
              {a.kind === "conta"
                ? data.accounts.filter((x) => !x.archived).map((x) => <option key={x.id} value={`acc:${x.id}`}>Conta: {x.name}</option>)
                : data.cards.filter((x) => !x.archived).map((x) => <option key={x.id} value={`card:${x.id}`}>Cartão: {x.name}</option>)}
              <option value="nao">Não sincronizar</option>
            </Select>
          </li>
        ))}
      </ul>
      <Field label="Importar lançamentos a partir de" className="mt-4 max-w-xs" hint="Lançamentos anteriores a esta data não são buscados.">
        <Input type="date" value={desde} max={today} onChange={(e) => setDesde(e.target.value)} />
      </Field>
    </Modal>
  );
}

// ------------------------------------------------------------------ revisão

const ROTULO: Record<Acao, string> = {
  despesa: "Despesa", receita: "Receita", transferencia: "Transferência entre contas", fatura: "Pagamento de fatura", compra: "Compra no cartão", ignorar: "Ignorar",
};

function opcoes(s: Sugestao): Acao[] {
  if (s.map.kind === "cartao") return s.tx.direction === "saida" ? ["compra", "ignorar"] : ["ignorar"];
  return s.tx.direction === "saida" ? ["despesa", "transferencia", "fatura", "ignorar"] : ["receita", "transferencia", "ignorar"];
}

function LinhaRevisao({ s, onChange }: { s: Sugestao; onChange: (s: Sugestao) => void }) {
  const { data } = useFinance();
  const kindCat = s.acao === "receita" ? "receita" : "despesa";
  const mudarAcao = (acao: Acao) => {
    const n: Sugestao = { ...s, acao };
    if (acao === "despesa" || acao === "receita" || acao === "compra") {
      const k = acao === "receita" ? "receita" : "despesa";
      const atual = data.categories.find((c) => c.id === s.category_id);
      if (!atual || atual.kind !== k) n.category_id = sugerirCategoriaBanco(s.tx, k, data.categories, new Map());
    } else n.category_id = null;
    if (acao === "fatura" && !n.card_id) {
      const card = data.cards.find((c) => !c.archived);
      if (card) { n.card_id = card.id; n.invoice_month = faturaDoPagamento(card, s.tx.date); }
    }
    onChange(n);
  };
  const ignorado = s.acao === "ignorar";
  return (
    <li className={cx("py-3", ignorado && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{s.description}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {formatBR(s.tx.date)} · {s.map.name}
            {s.tx.status === "PENDING" && <Badge tone="amber">fatura aberta</Badge>}
          </p>
        </div>
        <Money value={s.tx.direction === "entrada" ? s.tx.amount : -s.tx.amount} signed colored className="shrink-0 text-sm font-semibold" />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Select aria-label="O que fazer" value={s.acao} onChange={(e) => mudarAcao(e.target.value as Acao)} disabled={opcoes(s).length === 1}>
          {opcoes(s).map((o) => <option key={o} value={o}>{ROTULO[o]}</option>)}
        </Select>
        {(s.acao === "despesa" || s.acao === "receita" || s.acao === "compra") && (
          <CategorySelect kind={kindCat} value={s.category_id} onChange={(id) => onChange({ ...s, category_id: id })} />
        )}
        {s.acao === "transferencia" && (
          <AccountSelect value={s.to_account_id} exclude={s.map.account_id} onChange={(id) => onChange({ ...s, to_account_id: id })}
            placeholder={s.tx.direction === "saida" ? "Para qual conta?" : "De qual conta?"} />
        )}
        {s.acao === "fatura" && (
          <Select aria-label="Cartão da fatura" value={s.card_id ?? ""} onChange={(e) => {
            const card = data.cards.find((c) => c.id === e.target.value);
            onChange({ ...s, card_id: card?.id ?? null, invoice_month: card ? faturaDoPagamento(card, s.tx.date) : null });
          }}>
            <option value="">Escolha o cartão</option>
            {data.cards.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
      </div>
      {s.motivo && <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{s.motivo}</p>}
    </li>
  );
}

function Revisao({ link, inicial, onClose, onDone }: { link: Link; inicial: Sugestao[]; onClose: () => void; onDone: () => void }) {
  const { data, reload } = useFinance();
  const { busy, exec } = useAction();
  const [lista, setLista] = useState(inicial);
  const importar = lista.filter((s) => s.acao !== "ignorar").length;
  const ignorar = lista.length - importar;
  const confirmar = () =>
    exec(async () => {
      const itens = montarImportacao(lista, data);
      for (let i = 0; i < itens.length; i += 300) await ok(db().rpc("import_bank_items", { p_items: itens.slice(i, i + 300) }));
      await ok(db().from("bank_links").update({ last_sync_at: new Date().toISOString() }).eq("id", link.id));
      await reload();
    }, importar ? `${importar} ${importar === 1 ? "lançamento importado" : "lançamentos importados"}` : "Revisão salva").then((d) => d && onDone());
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Revisar ${link.institution}`}
      footer={<><Button variant="ghost" onClick={onClose}>Agora não</Button><Button loading={busy} onClick={confirmar}>{importar ? `Importar ${importar}` : "Confirmar"}</Button></>}
    >
      <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
        {lista.length} {lista.length === 1 ? "lançamento novo" : "lançamentos novos"}: <b className="text-slate-900 dark:text-white">{importar}</b> para importar e {ignorar} para ignorar.
        Os ignorados não voltam nas próximas sincronizações.
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
        {lista.map((s) => <LinhaRevisao key={s.tx.id} s={s} onChange={(n) => setLista((l) => l.map((x) => (x.tx.id === n.tx.id ? n : x)))} />)}
      </ul>
    </Modal>
  );
}

// ------------------------------------------------------------------ página

export default function Conexoes() {
  const { data, reload } = useFinance();
  const { toast, confirm } = useFeedback();
  const { busy, exec } = useAction();
  const [status, setStatus] = useState<Status | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [maps, setMaps] = useState<LinkAcc[]>([]);
  const [banco, setBanco] = useState<Record<string, ItemResp | { erro: string }>>({});
  const [itemId, setItemId] = useState("");
  const [mapear, setMapear] = useState<{ resp: ItemResp; link: Link | null } | null>(null);
  const [revisao, setRevisao] = useState<{ link: Link; sugs: Sugestao[] } | null>(null);
  const [sincronizando, setSincronizando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const st = await api<Status>("/api/pluggy/status");
      setStatus(st);
      const [l, m] = await Promise.all([ok(db().from("bank_links").select("*").order("created_at")), ok(db().from("bank_link_accounts").select("*").order("created_at"))]);
      setLinks((l ?? []) as Link[]);
      setMaps((m ?? []) as LinkAcc[]);
      if (st.configured && st.allowed)
        for (const link of (l ?? []) as Link[])
          api<ItemResp>("/api/pluggy/item", { itemId: link.item_id })
            .then((r) => setBanco((b) => ({ ...b, [link.id]: r })))
            .catch((e: Error) => setBanco((b) => ({ ...b, [link.id]: { erro: e.message } })));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui carregar as conexões.", "error");
      setStatus((s) => s ?? { configured: false, allowed: false, hasAllowList: false, email: null });
    }
  }, [toast]);
  useEffect(() => { carregar(); }, [carregar]);

  const conectar = () =>
    exec(async () => {
      const id = itemId.trim();
      if (!id) throw new Error("Cole o Item ID da conexão.");
      const resp = await api<ItemResp>("/api/pluggy/item", { itemId: id });
      if (!resp.accounts.length) throw new Error("Essa conexão não tem contas. Confira se a sincronização terminou na Pluggy.");
      setMapear({ resp, link: links.find((l) => l.item_id === resp.item.id) ?? null });
    });

  const sincronizar = async (link: Link) => {
    setSincronizando(link.id);
    try {
      const r = await api<{ items: BankTx[]; accounts: BankAccountInfo[]; item: ItemResp["item"] }>("/api/pluggy/sync", { linkId: link.id });
      setBanco((b) => ({ ...b, [link.id]: { item: r.item, accounts: r.accounts } }));
      const mapas: Mapeamento[] = maps
        .filter((m) => m.link_id === link.id && m.enabled)
        .map((m) => ({ external_id: m.external_id, kind: m.kind, account_id: m.account_id, card_id: m.card_id, name: m.name }));
      const sugs = sugerir(r.items, mapas, data);
      if (!sugs.length) {
        await ok(db().from("bank_links").update({ last_sync_at: new Date().toISOString() }).eq("id", link.id));
        toast("Tudo em dia: nenhum lançamento novo.", "info");
        carregar();
      } else setRevisao({ link, sugs });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui sincronizar.", "error");
    } finally {
      setSincronizando(null);
    }
  };

  const remover = async (link: Link) => {
    const sim = await confirm({
      title: `Remover a conexão ${link.institution}?`,
      text: "Os lançamentos já importados continuam no app. Só para de buscar novos.",
      danger: true,
      confirmLabel: "Remover",
    });
    if (sim) await exec(async () => { await ok(db().from("bank_links").delete().eq("id", link.id)); await carregar(); }, "Conexão removida");
  };

  const reverIgnorados = async () => {
    const sim = await confirm({ title: "Rever os ignorados?", text: "Os lançamentos que você ignorou voltam a aparecer na próxima sincronização.", confirmLabel: "Rever" });
    if (sim) await exec(() => ok(db().from("bank_imports").delete().eq("status", "ignorado")), "Na próxima sincronização eles aparecem de novo");
  };

  const ajustar = async (accountId: string, saldoBanco: number) => {
    const acc = data.accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const saldoApp = accountBalance(acc, data.transactions);
    const novo = ajusteSaldoInicial(saldoBanco, saldoApp, acc.initial_balance);
    const sim = await confirm({
      title: `Ajustar o saldo de ${acc.name}?`,
      text: <>O saldo inicial passa de <b>{formatMoney(acc.initial_balance)}</b> para <b>{formatMoney(novo)}</b> e o saldo da conta fica igual ao do banco ({formatMoney(saldoBanco)}). Faça isso depois de importar os lançamentos.</>,
      confirmLabel: "Ajustar",
    });
    if (sim) await exec(async () => { await ok(db().from("accounts").update({ initial_balance: novo }).eq("id", acc.id)); await reload(); }, "Saldo ajustado");
  };

  const pronto = status?.configured && status.allowed;
  const nomeApp = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of data.accounts) m.set(`acc:${a.id}`, a.name);
    for (const c of data.cards) m.set(`card:${c.id}`, c.name);
    return m;
  }, [data.accounts, data.cards]);

  return (
    <>
      <PageHeader title="Conexões bancárias" sub="Open Finance pela Pluggy: seus lançamentos chegam para revisão, sem digitar." />
      {!status ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          {!pronto && <Configurar status={status} />}

          <Card className="mb-5">
            <CardTitle sub="Cole o Item ID da conexão (painel da Pluggy → aplicação de demonstração → ⋮ → copiar Item ID).">Conectar banco</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input aria-label="Item ID" placeholder="ex.: 6f0b2c1e-...-a91d" value={itemId} onChange={(e) => setItemId(e.target.value)} disabled={!pronto} className="font-mono" />
              <Button icon={<PlugZap className="size-4" />} loading={busy && !!itemId} disabled={!pronto} onClick={conectar}>Conectar</Button>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="mt-px size-3.5 shrink-0" /> Somente leitura: o app não movimenta dinheiro. As chaves da Pluggy ficam no servidor.
            </p>
          </Card>

          {links.length === 0 ? (
            <Card><EmptyState icon={<Landmark className="size-6" />} title="Nenhum banco conectado" text="Depois de conectar, use “Sincronizar” para buscar os lançamentos novos." /></Card>
          ) : (
            <div className="space-y-5">
              {links.map((link) => {
                const info = banco[link.id];
                const contasBanco = info && "accounts" in info ? info.accounts : [];
                const meus = maps.filter((m) => m.link_id === link.id);
                return (
                  <Card key={link.id}>
                    <CardTitle
                      sub={link.last_sync_at ? `Última sincronização: ${new Date(link.last_sync_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "Ainda não sincronizado"}
                      action={<Badge tone={info && "erro" in info ? "red" : "green"}>{info && "erro" in info ? "com erro" : "conectado"}</Badge>}
                    >
                      {link.institution}
                    </CardTitle>
                    {info && "erro" in info && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{info.erro}</p>}
                    <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                      {meus.map((m) => {
                        const b = contasBanco.find((a) => a.id === m.external_id);
                        const appAcc = m.account_id ? data.accounts.find((a) => a.id === m.account_id) : null;
                        const saldoApp = appAcc ? accountBalance(appAcc, data.transactions) : null;
                        const diff = b && saldoApp !== null ? b.balance - saldoApp : 0;
                        const destino = !m.enabled ? "não sincroniza" : m.account_id ? nomeApp.get(`acc:${m.account_id}`) : m.card_id ? nomeApp.get(`card:${m.card_id}`) : "sem destino";
                        return (
                          <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                            {m.kind === "cartao" ? <CreditCard className="size-4 shrink-0 text-violet-500" /> : <Wallet className="size-4 shrink-0 text-brand-600 dark:text-brand-400" />}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{m.name}{m.number ? ` · ${m.number}` : ""}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">→ {destino ?? "excluída do app"} · desde {formatBR(m.sync_from)}</p>
                            </div>
                            {b && (
                              <div className="text-right text-xs">
                                <p className="text-slate-500 dark:text-slate-400">{m.kind === "cartao" ? "fatura no banco" : "no banco"} <Money value={b.balance} className="font-semibold text-slate-900 dark:text-white" /></p>
                                {saldoApp !== null && (
                                  <p className={cx(diff ? "text-amber-700 dark:text-amber-300" : "text-brand-700 dark:text-brand-400")}>
                                    no app <Money value={saldoApp} className="font-semibold" />{diff ? <> · <button className="font-medium underline" onClick={() => ajustar(m.account_id!, b.balance)}>ajustar</button></> : " ✓"}
                                  </p>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button icon={sincronizando === link.id ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />} disabled={!pronto || !!sincronizando} onClick={() => sincronizar(link)}>
                        {sincronizando === link.id ? "Buscando…" : "Sincronizar"}
                      </Button>
                      <Button variant="secondary" icon={<KeyRound className="size-4" />} disabled={!pronto || !(info && "accounts" in info)} onClick={() => info && "accounts" in info && setMapear({ resp: info, link })}>
                        Contas
                      </Button>
                      <Button variant="ghost" icon={<Unplug className="size-4" />} onClick={() => remover(link)}>Remover</Button>
                    </div>
                  </Card>
                );
              })}
              <button onClick={reverIgnorados} className="text-xs font-medium text-slate-500 underline hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">Rever lançamentos ignorados</button>
            </div>
          )}
        </>
      )}

      {mapear && (
        <Mapear
          resp={mapear.resp}
          link={mapear.link}
          maps={mapear.link ? maps.filter((m) => m.link_id === mapear.link!.id) : []}
          onClose={() => setMapear(null)}
          onSaved={() => { setMapear(null); setItemId(""); carregar(); }}
        />
      )}
      {revisao && (
        <Revisao link={revisao.link} inicial={revisao.sugs} onClose={() => setRevisao(null)} onDone={() => { setRevisao(null); carregar(); }} />
      )}
    </>
  );
}

