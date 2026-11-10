// Sincronização com o banco (Pluggy / Open Finance): normaliza o que vem da API e sugere
// como cada lançamento deve entrar no app. Nada aqui grava: a pessoa revisa e confirma.
//
// Regras para não duplicar nem distorcer os números:
//  * cada lançamento do banco tem um id; depois de importado ou ignorado ele não volta (tabela bank_imports);
//  * pagamento de fatura na conta vira "pagamento de fatura" (não é despesa: as compras do cartão já são);
//  * transferência entre duas contas suas conectadas vira UMA transferência (a outra ponta é ignorada);
//  * lançamento que parece já ter sido cadastrado à mão começa como "ignorar", com o motivo.
import type { Category, CreditCard, FinanceData } from "../types";
import { sugerirCategoria, norm } from "./assistant";
import { buildInstallments, dueDate, type CardDays } from "./cards";
import { addMonths, diffDays, monthStart, type ISODate } from "./dates";

// ------------------------------------------------------------------ dados da Pluggy

export interface BankAccountInfo {
  id: string;
  itemId: string;
  kind: "conta" | "cartao";
  subtype: string;
  name: string;
  number: string;
  /** centavos: saldo da conta, ou fatura atual no cartão */
  balance: number;
  creditLimit: number | null;
  closingDay: number | null;
  dueDay: number | null;
}

export interface BankTx {
  id: string;
  accountId: string;
  date: ISODate;
  description: string;
  /** centavos, sempre positivo */
  amount: number;
  direction: "entrada" | "saida";
  status: "PENDING" | "POSTED";
  installment: { n: number; total: number } | null;
  category: string | null;
  paymentMethod: string;
}

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

/** Data da Pluggy (ISO em UTC) para a data local do Brasil. Datas "puras" (meia-noite UTC) ficam como estão. */
export function localDate(iso: string): ISODate {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  if (/T00:00:00(\.0+)?Z$/.test(iso)) return iso.slice(0, 10);
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 10);
}

const dayOf = (iso: unknown): number | null => (typeof iso === "string" && iso.length >= 10 ? Number(localDate(iso).slice(8, 10)) : null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeAccount(raw: any): BankAccountInfo {
  const kind = raw.type === "CREDIT" ? "cartao" : "conta";
  const cd = raw.creditData ?? {};
  return {
    id: String(raw.id),
    itemId: String(raw.itemId ?? ""),
    kind,
    subtype: String(raw.subtype ?? ""),
    name: String(raw.marketingName || raw.name || (kind === "cartao" ? "Cartão" : "Conta")).slice(0, 120),
    number: String(raw.number ?? "").slice(0, 60),
    balance: cents(raw.balance),
    creditLimit: cd.creditLimit != null ? cents(cd.creditLimit) : null,
    closingDay: dayOf(cd.balanceCloseDate),
    dueDay: dayOf(cd.balanceDueDate),
  };
}

const METODO: Record<string, string> = { PIX: "Pix", TED: "Transferência", DOC: "Transferência", TEF: "Transferência", BOLETO: "Boleto" };

/** Converte uma transação da Pluggy. Cartão: valor positivo = compra; negativo = pagamento ou estorno. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeTx(raw: any, kind: "conta" | "cartao"): BankTx {
  const value = Number(raw.amount ?? 0);
  let direction: BankTx["direction"];
  if (kind === "cartao") direction = value < 0 ? "entrada" : "saida";
  else if (raw.type === "CREDIT") direction = "entrada";
  else if (raw.type === "DEBIT") direction = "saida";
  else direction = value < 0 ? "saida" : "entrada";
  const meta = raw.creditCardMetadata;
  const total = Number(meta?.totalInstallments ?? 0);
  return {
    id: String(raw.id),
    accountId: String(raw.accountId ?? ""),
    date: localDate(String(raw.date)),
    description: String(raw.description || raw.descriptionRaw || "Lançamento do banco").replace(/\s+/g, " ").trim().slice(0, 120),
    amount: Math.abs(cents(value)),
    direction,
    status: raw.status === "PENDING" ? "PENDING" : "POSTED",
    installment: total > 1 ? { n: Number(meta.installmentNumber ?? 1), total } : null,
    category: raw.category ?? null,
    paymentMethod: METODO[String(raw.paymentData?.paymentMethod ?? "").toUpperCase()] ?? "",
  };
}

/** O que entra para revisão: na conta só o que já foi efetivado; no cartão, todas as compras. */
export function importable(t: BankTx, kind: "conta" | "cartao"): boolean {
  if (!t.amount) return false;
  return kind === "cartao" || t.status === "POSTED";
}

// ------------------------------------------------------------------ sugestões

export type Acao = "despesa" | "receita" | "transferencia" | "fatura" | "compra" | "ignorar";

export interface Mapeamento {
  external_id: string;
  kind: "conta" | "cartao";
  account_id: string | null;
  card_id: string | null;
  name: string;
}

export interface Sugestao {
  tx: BankTx;
  map: Mapeamento;
  acao: Acao;
  description: string;
  category_id: string | null;
  to_account_id: string | null;
  card_id: string | null;
  invoice_month: ISODate | null;
  /** por que a sugestão é essa (aparece na revisão) */
  motivo: string | null;
}

/** Categorias da Pluggy (em inglês) → categoria padrão do app. */
const PLUGGY_CAT: [RegExp, string][] = [
  [/groceries|supermarket|eating out|restaurant|food|bakery/i, "Alimentação"],
  [/gas station|fuel/i, "Combustível"],
  [/taxi|ride|public transport|transport|parking|toll|bicycle/i, "Transporte"],
  [/rent|housing|condominium|home/i, "Moradia"],
  [/electricity|water|utilities|telecom|internet|mobile|phone/i, "Contas domésticas"],
  [/pharmacy|health|hospital|clinic|dentist|gym|wellness/i, "Saúde"],
  [/education|school|university|course|book/i, "Educação"],
  [/leisure|entertainment|travel|airline|hotel|accommodation|cinema|bar/i, "Lazer"],
  [/subscription|streaming|digital service|software/i, "Assinaturas"],
  [/tax/i, "Impostos"],
  [/shopping|clothing|electronics|department|online/i, "Compras"],
  [/loan|financing|interest charged/i, "Empréstimos e financiamentos"],
  [/salary|payroll|wage/i, "Salário"],
  [/investment income|interest|dividend|yield|cashback/i, "Rendimentos"],
];

/** Descrição sem números (datas, parcelas, códigos) para comparar com o histórico. */
const chave = (s: string) => norm(s).replace(/[0-9]+/g, " ").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

function categoriaDoHistorico(data: FinanceData): Map<string, string> {
  const m = new Map<string, string>();
  const itens = [
    ...data.transactions.filter((t) => t.category_id && (t.kind === "despesa" || t.kind === "receita")).map((t) => ({ k: `${t.kind}:${chave(t.description)}`, c: t.category_id!, d: t.created_at ?? t.due_date })),
    ...data.purchases.filter((p) => p.category_id).map((p) => ({ k: `despesa:${chave(p.description)}`, c: p.category_id!, d: p.created_at ?? p.purchase_date })),
  ].sort((a, b) => a.d.localeCompare(b.d));
  for (const i of itens) if (i.k.length > 9) m.set(i.k, i.c); // o mais recente vence
  return m;
}

export function sugerirCategoriaBanco(t: BankTx, kind: "despesa" | "receita", cats: Category[], historico: Map<string, string>): string | null {
  const h = historico.get(`${kind}:${chave(t.description)}`);
  if (h && cats.some((c) => c.id === h)) return h;
  if (t.category) {
    for (const [re, nome] of PLUGGY_CAT) {
      if (re.test(t.category)) {
        const c = cats.find((x) => x.kind === kind && norm(x.name) === norm(nome));
        if (c) return c.id;
      }
    }
  }
  return sugerirCategoria(t.description, cats, kind).id;
}

/** Mês da fatura que um pagamento quita: a fatura cujo vencimento fica mais perto da data do pagamento. */
export function faturaDoPagamento(card: CardDays, date: ISODate): ISODate {
  const base = monthStart(date);
  const opcoes = [-2, -1, 0, 1].map((k) => addMonths(base, k));
  return opcoes.reduce((m, o) => (Math.abs(diffDays(dueDate(card, o), date)) < Math.abs(diffDays(dueDate(card, m), date)) ? o : m));
}

const PAGAMENTO_FATURA = /fatura|pagamento (de |do )?cart|pgto\.? ?cart|pag(to)?\.? fat|cartao de credito|cartao credito/;

function acharCartao(desc: string, cards: CreditCard[], preferidos: string[]): CreditCard | null {
  const ativos = cards.filter((c) => !c.archived);
  const d = norm(desc);
  const porNome = ativos.find((c) => [c.name, c.institution].some((n) => n && norm(n).length >= 3 && d.includes(norm(n))));
  if (porNome) return porNome;
  const pref = ativos.filter((c) => preferidos.includes(c.id));
  if (pref.length === 1) return pref[0];
  if (ativos.length === 1) return ativos[0];
  return null;
}

const comParcela = (t: BankTx) =>
  t.installment && !/\d+\s*\/\s*\d+/.test(t.description) ? `${t.description} (${t.installment.n}/${t.installment.total})`.slice(0, 120) : t.description;

/**
 * Sugere a ação de cada lançamento. `itens` são os lançamentos ainda não tratados;
 * `mapas` diz para qual conta/cartão do app vai cada conta do banco.
 */
export function sugerir(itens: BankTx[], mapas: Mapeamento[], data: FinanceData): Sugestao[] {
  const porConta = new Map(mapas.map((m) => [m.external_id, m]));
  const historico = categoriaDoHistorico(data);
  const cardsById = new Map(data.cards.map((c) => [c.id, c]));
  const cartoesConectados = mapas.filter((m) => m.card_id).map((m) => m.card_id!);
  const usados = new Set<string>(); // lançamentos do app já "casados" com algum do banco

  const ordenados = [...itens].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const out: Sugestao[] = [];

  // transferências entre duas contas conectadas: casa cada saída com a entrada de mesmo valor (até 3 dias)
  const contaApp = (t: BankTx) => {
    const m = porConta.get(t.accountId);
    return m?.kind === "conta" ? m.account_id : null;
  };
  const par = new Map<string, BankTx>();
  for (const s of ordenados) {
    if (s.direction !== "saida" || !contaApp(s)) continue;
    const e = ordenados
      .filter((o) => o.direction === "entrada" && !par.has(o.id) && o.amount === s.amount && contaApp(o) && contaApp(o) !== contaApp(s) && Math.abs(diffDays(o.date, s.date)) <= 3)
      .sort((a, b) => Math.abs(diffDays(a.date, s.date)) - Math.abs(diffDays(b.date, s.date)))[0];
    if (e) {
      par.set(s.id, e);
      par.set(e.id, s);
    }
  }

  for (const t of ordenados) {
    const map = porConta.get(t.accountId);
    if (!map) continue;
    const s: Sugestao = { tx: t, map, acao: "ignorar", description: t.description, category_id: null, to_account_id: null, card_id: null, invoice_month: null, motivo: null };

    if (map.kind === "cartao") {
      s.card_id = map.card_id;
      if (t.direction === "entrada") {
        s.acao = "ignorar";
        s.motivo = /pagamento|pgto|pag /.test(norm(t.description))
          ? "Pagamento da fatura: registre pela conta que pagou"
          : "Estorno ou crédito no cartão: o app ainda não registra estornos";
      } else {
        s.acao = "compra";
        s.description = comParcela(t);
        s.category_id = sugerirCategoriaBanco(t, "despesa", data.categories, historico);
        // parece já lançada à mão?
        const n = t.installment?.n ?? 1;
        const dataCompra = addMonths(t.date, -(n - 1));
        const dup = data.purchases.find(
          (p) =>
            !usados.has(p.id) &&
            p.card_id === map.card_id &&
            Math.abs(diffDays(p.purchase_date, dataCompra)) <= 5 &&
            (t.installment ? p.installments === t.installment.total && Math.abs(Math.round(p.total / p.installments) - t.amount) <= p.installments : p.total === t.amount),
        );
        if (dup) {
          usados.add(dup.id);
          s.acao = "ignorar";
          s.motivo = `Parece já lançada: ${dup.description}`;
        }
      }
      out.push(s);
      continue;
    }

    // conta bancária
    const tipo = t.direction === "entrada" ? "receita" : "despesa";
    s.acao = tipo;
    s.category_id = sugerirCategoriaBanco(t, tipo, data.categories, historico);

    // transferência entre duas contas conectadas: a saída vira a transferência, a entrada é ignorada
    const outra = par.get(t.id);
    if (outra) {
      const outraMap = porConta.get(outra.accountId)!;
      s.category_id = null;
      if (t.direction === "entrada") {
        s.acao = "ignorar";
        s.motivo = `Entrada da transferência de ${outraMap.name}`;
        out.push(s);
        continue;
      }
      s.acao = "transferencia";
      s.to_account_id = outraMap.account_id;
      s.motivo = `Transferência para ${outraMap.name}`;
    }

    // pagamento de fatura de cartão
    if (s.acao === "despesa" && PAGAMENTO_FATURA.test(norm(t.description))) {
      const card = acharCartao(t.description, data.cards, cartoesConectados);
      if (card) {
        s.acao = "fatura";
        s.card_id = card.id;
        s.invoice_month = faturaDoPagamento(card, t.date);
        s.category_id = null;
        s.motivo = `Pagamento da fatura do ${card.name}`;
      }
    }

    // parece já cadastrado à mão?
    const kindApp = s.acao === "fatura" || s.acao === "transferencia" ? s.acao : tipo;
    const dup = data.transactions.find(
      (x) =>
        !usados.has(x.id) &&
        x.kind === kindApp &&
        x.amount === t.amount &&
        (x.account_id === map.account_id || (!x.paid_date && !x.account_id)) &&
        (kindApp !== "fatura" || x.card_id === s.card_id) &&
        (kindApp !== "transferencia" || x.to_account_id === s.to_account_id) &&
        Math.abs(diffDays(x.paid_date ?? x.due_date, t.date)) <= 3,
    );
    if (dup) {
      usados.add(dup.id);
      s.acao = "ignorar";
      s.motivo = dup.paid_date ? `Parece já lançado: ${dup.description}` : `Parece ser "${dup.description}" (pendente no app): quite por lá`;
    }
    out.push(s);
  }

  for (const s of out) if (s.acao === "fatura" && s.card_id && !cardsById.has(s.card_id)) s.acao = "despesa";
  return out.sort((a, b) => b.tx.date.localeCompare(a.tx.date) || a.tx.id.localeCompare(b.tx.id));
}

// ------------------------------------------------------------------ o que vai para o banco

export interface ItemImportacao {
  external_id: string;
  action: "transacao" | "compra" | "ignorar";
  tx?: Record<string, unknown>;
  purchase?: Record<string, unknown>;
}

const NOTA = "Importado do banco (Pluggy)";

/** Valida a decisão de cada linha e monta o lote para `import_bank_items`. Lança erro com a linha problemática. */
export function montarImportacao(sugs: Sugestao[], data: FinanceData): ItemImportacao[] {
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  return sugs.map((s) => {
    const t = s.tx;
    const erro = (msg: string) => new Error(`${t.description} (${t.date.split("-").reverse().join("/")}): ${msg}`);
    switch (s.acao) {
      case "ignorar":
        return { external_id: t.id, action: "ignorar" };
      case "compra": {
        const card = s.card_id ? cards.get(s.card_id) : null;
        if (!card) throw erro("escolha o cartão do app");
        return {
          external_id: t.id,
          action: "compra",
          purchase: {
            card_id: card.id, description: s.description, category_id: s.category_id, total: t.amount, purchase_date: t.date, notes: NOTA,
            installments: buildInstallments(card, t.date, t.amount, 1),
          },
        };
      }
      case "despesa":
      case "receita":
      case "transferencia":
      case "fatura": {
        if (!s.map.account_id) throw erro("escolha a conta do app");
        if (s.acao === "transferencia" && (!s.to_account_id || s.to_account_id === s.map.account_id)) throw erro("escolha a outra conta da transferência");
        if (s.acao === "fatura" && (!s.card_id || !s.invoice_month)) throw erro("escolha o cartão da fatura");
        if (s.acao === "despesa" && t.direction === "entrada") throw erro("uma entrada não pode ser despesa");
        if ((s.acao === "receita") && t.direction === "saida") throw erro("uma saída não pode ser receita");
        // transferência: na saída, desta conta para a outra; na entrada, da outra para esta
        const entrada = s.acao === "transferencia" && t.direction === "entrada";
        return {
          external_id: t.id,
          action: "transacao",
          tx: {
            kind: s.acao,
            description: s.description,
            amount: t.amount,
            due_date: t.date,
            paid_date: t.date,
            account_id: entrada ? s.to_account_id : s.map.account_id,
            to_account_id: s.acao === "transferencia" ? (entrada ? s.map.account_id : s.to_account_id) : null,
            category_id: s.acao === "despesa" || s.acao === "receita" ? s.category_id : null,
            payment_method: s.acao === "fatura" ? "" : t.paymentMethod,
            notes: NOTA,
            card_id: s.acao === "fatura" ? s.card_id : null,
            invoice_month: s.acao === "fatura" ? s.invoice_month : null,
          },
        };
      }
    }
  });
}

/** Ajuste no saldo inicial para o saldo do app bater com o do banco (só contas). */
export function ajusteSaldoInicial(saldoBanco: number, saldoApp: number, saldoInicialAtual: number): number {
  return saldoInicialAtual + (saldoBanco - saldoApp);
}
