"use client";
// Assistente: escreva gastos e ganhos como falaria; ele organiza (valor, categoria, data, conta/cartão,
// parcelas), salva com um toque e responde perguntas e dicas com base nos seus dados. Sem IA paga:
// as regras ficam em lib/finance/assistant.ts e rodam no aparelho.
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, CheckCircle2, Lightbulb, Pencil, Send, Trash2, Undo2, Wallet, X } from "lucide-react";
import { useFinance, categoryLabel } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { EXEMPLOS, responder, type DraftEntry, type Reply, type Tip } from "@/lib/finance/assistant";
import { canISpend, type SpendAnswer } from "@/lib/finance/insights";
import { buildInstallments } from "@/lib/finance/cards";
import { formatBR, type ISODate } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { PAYMENT_METHODS, type Transaction } from "@/lib/types";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, Field, IconButton, Input, MoneyInput, Select, Segmented, Skeleton, Toggle, cx } from "@/components/ui";
import { AccountSelect, CategorySelect } from "@/components/forms/fields";
import { InsightCard } from "@/components/insight-card";
import { useAction, useFeedback } from "@/components/feedback";

type Status = "rascunho" | "salvo" | "descartado" | "desfeito";
interface Salvo { tx: string[]; compras: string[] }
type Msg =
  | { id: string; de: "voce"; texto: string; em: string }
  | { id: string; de: "assistente"; em: string; reply: Reply; status?: Status; salvo?: Salvo; posso?: SpendAnswer };

const LIMITE = 80;

/** Pendências atuais de um conjunto de lançamentos (recalculadas a cada edição). */
function pendencias(r: Extract<Reply, { type: "lancamentos" }>): string[] {
  const fixos = r.problems.filter((p) => !/^Escolha o cartão|^Cadastre uma conta/.test(p));
  const vivos: string[] = [];
  for (const i of r.items) {
    if (i.via === "cartao" && !i.cardId) vivos.push(`Escolha o cartão de "${i.description}".`);
    if (i.via === "conta" && i.paid && !i.accountId) vivos.push(`Escolha a conta de "${i.description}".`);
  }
  return [...fixos, ...vivos];
}
const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));

function rotuloData(d: ISODate, hoje: ISODate): string {
  if (d === hoje) return "hoje";
  const ontem = new Date(hoje + "T12:00:00");
  ontem.setDate(ontem.getDate() - 1);
  if (d === ontem.toISOString().slice(0, 10)) return "ontem";
  return formatBR(d);
}

export default function AssistantPage() {
  const fin = useFinance();
  const { data, today, entries, loading } = fin;
  const { toast } = useFeedback();
  const { exec, busy } = useAction();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [chave, setChave] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  // conversa guardada neste aparelho, separada por usuário
  useEffect(() => {
    supabase().auth.getUser().then(({ data: u }) => {
      const k = `financas.assistente.${u.user?.id ?? "anon"}`;
      setChave(k);
      try {
        const salvo = JSON.parse(localStorage.getItem(k) ?? "null");
        if (salvo?.msgs) setMsgs(salvo.msgs);
        if (salvo?.auto) setAuto(true);
      } catch { /* conversa ilegível: começa de novo */ }
    });
  }, []);
  useEffect(() => {
    if (!chave) return;
    try { localStorage.setItem(chave, JSON.stringify({ msgs: msgs.slice(-LIMITE), auto })); } catch { /* armazenamento cheio ou bloqueado */ }
  }, [msgs, auto, chave]);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs.length]);

  const ctx = useMemo(() => ({ data, today, entries }), [data, today, entries]);
  const atualizar = (id: string, patch: Partial<Extract<Msg, { de: "assistente" }>>) =>
    setMsgs((m) => m.map((x) => (x.id === id && x.de === "assistente" ? { ...x, ...patch } : x)));

  function podeSalvarDireto(r: Reply): boolean {
    if (r.type !== "lancamentos" || pendencias(r).length) return false;
    return r.items.every((i) => !i.guessed.includes("categoria") && !i.guessed.includes("cartao") && (i.via === "cartao" ? !!i.cardId : !i.paid || !!i.accountId));
  }

  async function enviar(t?: string) {
    const frase = (t ?? texto).trim();
    if (!frase) return;
    setTexto("");
    const reply = responder(frase, ctx);
    const voce: Msg = { id: novoId(), de: "voce", texto: frase, em: new Date().toISOString() };
    const resp: Msg = { id: novoId(), de: "assistente", em: new Date().toISOString(), reply };
    if (reply.type === "lancamentos") resp.status = "rascunho";
    if (reply.type === "posso_gastar") resp.posso = canISpend(data, today, reply.amount, reply.categoryId);
    setMsgs((m) => [...m, voce, resp].slice(-LIMITE));
    if (auto && podeSalvarDireto(reply)) await salvar(resp.id, reply.type === "lancamentos" ? reply.items : []);
    campo.current?.focus();
  }

  async function salvar(msgId: string, itens: DraftEntry[]) {
    const salvo: Salvo = { tx: [], compras: [] };
    const ok = await exec(async () => {
      const linhas: Partial<Transaction>[] = [];
      for (const i of itens) {
        const nota = `Assistente: ${i.original}`.slice(0, 1000);
        if (i.via === "cartao") {
          const card = data.cards.find((c) => c.id === i.cardId);
          if (!card) throw new Error(`Escolha o cartão de "${i.description}".`);
          const id = await fin.saveCardPurchase({
            card_id: card.id, description: i.description, category_id: i.categoryId, total: i.amount,
            installments: buildInstallments(card, i.date, i.amount, i.installments), purchase_date: i.date, notes: nota,
          });
          if (id) salvo.compras.push(id);
        } else {
          if (i.paid && !i.accountId) throw new Error(`Escolha a conta de "${i.description}".`);
          const id = novoId();
          salvo.tx.push(id);
          linhas.push({
            id, kind: i.kind, description: i.description, amount: i.amount, due_date: i.date, paid_date: i.paid ? i.date : null,
            account_id: i.accountId, category_id: i.categoryId, payment_method: i.paymentMethod, notes: nota,
          });
        }
      }
      if (linhas.length) await fin.insert("transactions", linhas);
    }, itens.length > 1 ? `${itens.length} lançamentos salvos` : "Lançamento salvo");
    if (ok) atualizar(msgId, { status: "salvo", salvo });
    else if (salvo.compras.length) atualizar(msgId, { status: "salvo", salvo }); // parte foi salva antes do erro
  }

  async function desfazer(msgId: string, s: Salvo) {
    const ok = await exec(async () => {
      if (s.tx.length) await fin.remove("transactions", s.tx);
      if (s.compras.length) await fin.remove("purchases", s.compras);
    }, "Desfeito");
    if (ok) atualizar(msgId, { status: "desfeito" });
  }

  function limpar() {
    setMsgs([]);
    toast("Conversa apagada deste aparelho");
  }

  if (loading) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader
        title="Assistente"
        sub="Escreva seus gastos e ganhos como falaria. Ele organiza, salva e dá dicas com base nos seus dados."
        actions={msgs.length ? <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={limpar}>Limpar conversa</Button> : null}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="flex min-h-[55dvh] flex-col p-0 sm:p-0">
            <div className="flex-1 space-y-4 p-4 sm:p-5" aria-live="polite">
              {!msgs.length && <Boas vindas={(t) => enviar(t)} />}
              {msgs.map((m) =>
                m.de === "voce" ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy-950 px-4 py-2.5 text-sm text-white dark:bg-brand-400 dark:font-medium dark:text-navy-950">{m.texto}</p>
                  </div>
                ) : (
                  <Resposta
                    key={m.id}
                    msg={m}
                    hoje={today}
                    busy={busy}
                    onItens={(items) => atualizar(m.id, { reply: { ...(m.reply as Extract<Reply, { type: "lancamentos" }>), items } })}
                    onSalvar={(items) => salvar(m.id, items)}
                    onDescartar={() => atualizar(m.id, { status: "descartado" })}
                    onDesfazer={() => m.salvo && desfazer(m.id, m.salvo)}
                    onExemplo={(t) => enviar(t)}
                  />
                ),
              )}
              <div ref={fim} />
            </div>
            <form
              className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 flex items-end gap-2 rounded-b-2xl border-t border-slate-100 bg-white/95 p-3 backdrop-blur lg:bottom-0 dark:border-line/70 dark:bg-navy-900/95"
              onSubmit={(e) => { e.preventDefault(); enviar(); }}
            >
              <textarea
                ref={campo}
                rows={1}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                placeholder='Ex.: "gastei 45 no mercado ontem"'
                aria-label="Mensagem para o assistente"
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-400/20 dark:border-navy-700 dark:bg-navy-950 dark:border-line dark:focus:border-brand-400"
              />
              <Button type="submit" aria-label="Enviar" disabled={!texto.trim()} icon={<Send className="size-4" />} className="h-11 w-11 shrink-0 px-0" />
            </form>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <p className="text-sm font-semibold">Atalhos</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["dicas", "quanto gastei este mês?", "saldo", "quanto gastei mês passado?", "posso gastar 100?", "ajuda"].map((t) => (
                <button key={t} type="button" onClick={() => enviar(t)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-tint/[0.06]">{t}</button>
              ))}
            </div>
          </Card>
          <Card>
            <Toggle checked={auto} onChange={setAuto} label="Salvar sem confirmar quando tiver certeza" />
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Desligado, cada lançamento aparece para você conferir e tocar em Salvar. Ligado, salva direto quando valor, categoria e conta foram identificados; dá para desfazer.
            </p>
          </Card>
          <Card>
            <p className="text-sm font-semibold">Como funciona</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <li>Entende valor, data (hoje, ontem, dia 5, 03/11), conta ou cartão pelo nome, parcelas (3x) e a forma de pagamento.</li>
              <li>A categoria vem de palavras como mercado, uber, luz, farmácia, Netflix ou do nome de uma categoria sua.</li>
              <li>Funciona sem IA paga: as regras rodam no seu aparelho e as respostas usam só os seus lançamentos.</li>
              <li>A conversa fica salva só neste aparelho.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function Boas({ vindas }: { vindas: (t: string) => void }) {
  return (
    <div className="py-6 text-center">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-400/15 text-brand-700 ring-1 ring-brand-400/20 dark:bg-brand-400/10 dark:text-brand-400"><Bot className="size-6" /></div>
      <p className="font-semibold">Olá! Me conte seus gastos e ganhos.</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">Escreva do seu jeito, um por linha ou vários na mesma frase. Toque num exemplo para experimentar:</p>
      <Exemplos onExemplo={vindas} />
    </div>
  );
}

function Exemplos({ onExemplo }: { onExemplo: (t: string) => void }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {EXEMPLOS.map((e) => (
        <button key={e} type="button" onClick={() => onExemplo(e)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-200 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-tint/[0.06]">{e}</button>
      ))}
    </div>
  );
}

function Balao({ children, icone }: { children: React.ReactNode; icone?: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-400/15 text-brand-700 ring-1 ring-brand-400/20 dark:bg-brand-400/10 dark:text-brand-400">{icone ?? <Bot className="size-4" />}</span>
      <div className="min-w-0 max-w-[92%] flex-1 rounded-2xl rounded-tl-md bg-slate-100/80 px-4 py-3 text-sm dark:bg-tint/[0.04] dark:ring-1 dark:ring-line/60">{children}</div>
    </div>
  );
}

function Resposta({
  msg, hoje, busy, onItens, onSalvar, onDescartar, onDesfazer, onExemplo,
}: {
  msg: Extract<Msg, { de: "assistente" }>;
  hoje: ISODate;
  busy: boolean;
  onItens: (i: DraftEntry[]) => void;
  onSalvar: (i: DraftEntry[]) => void;
  onDescartar: () => void;
  onDesfazer: () => void;
  onExemplo: (t: string) => void;
}) {
  const r = msg.reply;
  if (r.type === "lancamentos") {
    const st = msg.status ?? "rascunho";
    return (
      <Balao>
        {st === "rascunho" && <p className="mb-2 text-slate-600 dark:text-slate-300">{r.items.length > 1 ? `Entendi ${r.items.length} lançamentos. Confira e salve:` : "Entendi assim. Confira e salve:"}</p>}
        {st === "salvo" && <p className="mb-2 flex items-center gap-1.5 font-medium text-brand-700 dark:text-brand-400"><CheckCircle2 className="size-4" />{r.items.length > 1 ? "Salvos." : "Salvo."}</p>}
        {st === "descartado" && <p className="mb-2 text-slate-500">Descartado.</p>}
        {st === "desfeito" && <p className="mb-2 text-slate-500">Desfeito: nada foi gravado.</p>}
        <div className="space-y-2">
          {r.items.map((it, idx) => (
            <Rascunho key={idx} item={it} hoje={hoje} editavel={st === "rascunho"} onChange={(n) => onItens(r.items.map((x, j) => (j === idx ? n : x)))} onRemover={r.items.length > 1 && st === "rascunho" ? () => onItens(r.items.filter((_, j) => j !== idx)) : undefined} />
          ))}
        </div>
        {st === "rascunho" && pendencias(r).length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">{pendencias(r).map((p) => <li key={p}>{p}</li>)}</ul>}
        {st === "rascunho" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" loading={busy} icon={<Check className="size-4" />} onClick={() => onSalvar(r.items)}>{r.items.length > 1 ? "Salvar todos" : "Salvar"}</Button>
            <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={onDescartar}>Descartar</Button>
          </div>
        )}
        {st === "salvo" && msg.salvo && (msg.salvo.tx.length + msg.salvo.compras.length > 0) && (
          <Button size="sm" variant="secondary" className="mt-3" loading={busy} icon={<Undo2 className="size-4" />} onClick={onDesfazer}>Desfazer</Button>
        )}
      </Balao>
    );
  }
  if (r.type === "posso_gastar" && msg.posso) {
    const a = msg.posso, tone = a.verdict === "sim" ? "text-brand-700 dark:text-brand-400" : a.verdict === "cuidado" ? "text-amber-700 dark:text-amber-400" : "text-rose-700 dark:text-rose-400";
    return (
      <Balao icone={<Wallet className="size-4" />}>
        <p className={cx("font-semibold", tone)}>{a.title}</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">{a.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
      </Balao>
    );
  }
  if (r.type === "resumo" || r.type === "saldo") {
    return (
      <Balao>
        <p className="font-semibold">{r.title}</p>
        <ul className="mt-1.5 space-y-1 text-slate-600 dark:text-slate-300">{r.lines.map((x) => <li key={x}>{x}</li>)}</ul>
      </Balao>
    );
  }
  if (r.type === "dicas") {
    return (
      <div className="space-y-2">
        <Balao icone={<Lightbulb className="size-4" />}><p>{r.tips.length > 1 ? "Olhei seus lançamentos. Minhas dicas:" : "Olhei seus dados:"}</p></Balao>
        <div className="space-y-2 pl-10">{r.tips.map((t: Tip) => <InsightCard key={t.id} insight={t} compact />)}</div>
        <p className="pl-10 text-xs text-slate-500">Dicas automáticas, feitas com regras e com os seus números. Não substituem a orientação de um profissional.</p>
      </div>
    );
  }
  if (r.type === "ajuda") {
    return (
      <Balao>
        <p>Você pode escrever gastos, ganhos e perguntas. Alguns exemplos:</p>
        <Exemplos onExemplo={onExemplo} />
      </Balao>
    );
  }
  return <Balao><p className="text-slate-600 dark:text-slate-300">{r.type === "nao_entendi" ? r.text : "Não consegui calcular agora. Tente de novo."}</p></Balao>;
}

function Rascunho({ item, hoje, editavel, onChange, onRemover }: { item: DraftEntry; hoje: ISODate; editavel: boolean; onChange: (i: DraftEntry) => void; onRemover?: () => void }) {
  const { data } = useFinance();
  const [editando, setEditando] = useState(false);
  const set = <K extends keyof DraftEntry>(k: K, v: DraftEntry[K], conferido?: DraftEntry["guessed"][number]) =>
    onChange({ ...item, [k]: v, guessed: conferido ? item.guessed.filter((g) => g !== conferido) : item.guessed });
  const cartao = data.cards.find((c) => c.id === item.cardId);
  const conta = data.accounts.find((a) => a.id === item.accountId);
  const isReceita = item.kind === "receita";
  const onde = item.via === "cartao" ? (cartao ? `Cartão ${cartao.name}` : "Cartão (escolha)") : conta?.name ?? "Sem conta";
  const situacao = item.via === "cartao" ? (item.installments > 1 ? `${item.installments}x de ${formatMoney(Math.round(item.amount / item.installments))}` : "à vista") : item.paid ? (isReceita ? "recebida" : "paga") : isReceita ? "a receber" : "a pagar";

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200 dark:bg-navy-900 dark:ring-navy-700">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cx("font-semibold tabular", isReceita ? "text-emerald-600 dark:text-brand-400" : "text-rose-600")}>{isReceita ? "+" : "−"} {formatMoney(item.amount)}</span>
            <span className="font-medium">{item.description}</span>
          </p>
          <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
            <Badge tone={item.guessed.includes("categoria") ? "amber" : "slate"}>{categoryLabel(data.categories, item.categoryId)}</Badge>
            <Badge tone={item.guessed.includes("conta") || item.guessed.includes("cartao") ? "amber" : "slate"}>{onde}</Badge>
            <Badge tone="slate">{rotuloData(item.date, hoje)}</Badge>
            <Badge tone={item.via === "cartao" ? "violet" : item.paid ? "green" : "blue"}>{situacao}</Badge>
            {item.paymentMethod && <Badge tone="slate">{item.paymentMethod}</Badge>}
          </p>
          {editavel && (item.guessed.includes("categoria") || item.guessed.includes("cartao")) && !editando && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">Confira os itens em amarelo: foram deduzidos.</p>
          )}
        </div>
        {editavel && (
          <div className="flex shrink-0">
            <IconButton label={editando ? "Fechar edição" : "Editar"} onClick={() => setEditando((v) => !v)}><Pencil className="size-4" /></IconButton>
            {onRemover && <IconButton label="Remover" onClick={onRemover}><X className="size-4" /></IconButton>}
          </div>
        )}
      </div>
      {editavel && editando && (
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 dark:border-line/70">
          <Field label="Tipo">
            <Segmented
              value={item.kind === "receita" ? "receita" : item.via === "cartao" ? "cartao" : "despesa"}
              onChange={(v) => {
                if (v === "receita") onChange({ ...item, kind: "receita", via: "conta", paymentMethod: "", accountId: item.accountId ?? data.accounts.find((a) => !a.archived)?.id ?? null, categoryId: null, guessed: [...new Set([...item.guessed, "categoria" as const])] });
                else if (v === "cartao") onChange({ ...item, kind: "despesa", via: "cartao", cardId: item.cardId ?? (data.cards.filter((c) => !c.archived).length === 1 ? data.cards.find((c) => !c.archived)!.id : null), paid: true, paymentMethod: "" });
                else onChange({ ...item, kind: "despesa", via: "conta", installments: 1, paymentMethod: item.paymentMethod || "Pix", accountId: item.accountId ?? data.accounts.find((a) => !a.archived)?.id ?? null, ...(item.kind === "receita" ? { categoryId: null } : {}) });
              }}
              options={[{ value: "despesa", label: "Despesa" }, { value: "cartao", label: "Cartão" }, { value: "receita", label: "Receita" }]}
            />
          </Field>
          <Field label="Valor"><MoneyInput value={item.amount} onChange={(v) => set("amount", v)} /></Field>
          <Field label="Descrição"><Input value={item.description} maxLength={120} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="Categoria"><CategorySelect kind={item.kind} value={item.categoryId} onChange={(v) => set("categoryId", v, "categoria")} /></Field>
          {item.via === "cartao" ? (
            <>
              <Field label="Cartão">
                <Select value={item.cardId ?? ""} onChange={(e) => set("cardId", e.target.value || null, "cartao")}>
                  <option value="">Escolha o cartão</option>
                  {data.cards.filter((c) => !c.archived || c.id === item.cardId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Parcelas">
                <Select value={item.installments} onChange={(e) => set("installments", Number(e.target.value))}>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? "À vista" : `${n}x de ${formatMoney(Math.round(item.amount / n))}`}</option>)}
                </Select>
              </Field>
              <Field label="Data da compra"><Input type="date" value={item.date} onChange={(e) => e.target.value && set("date", e.target.value, "data")} /></Field>
            </>
          ) : (
            <>
              <Field label="Conta"><AccountSelect value={item.accountId} onChange={(v) => set("accountId", v, "conta")} /></Field>
              <Field label={item.paid ? (isReceita ? "Recebido em" : "Pago em") : "Vencimento"}><Input type="date" value={item.date} onChange={(e) => e.target.value && set("date", e.target.value, "data")} /></Field>
              {!isReceita && (
                <Field label="Forma de pagamento">
                  <Select value={item.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
                    {PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}
                  </Select>
                </Field>
              )}
              <div className="flex items-end pb-2"><Toggle checked={item.paid} onChange={(v) => set("paid", v)} label={isReceita ? "Já recebido" : "Já pago"} /></div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
