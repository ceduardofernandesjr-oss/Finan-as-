// Assistente financeiro sem IA paga: entende frases comuns em português e responde com base nos
// seus próprios dados. Tudo aqui é determinístico (regras), roda no aparelho e é testado.
//
//   "gastei 45 no mercado ontem no nubank"    → despesa paga, Alimentação, ontem, conta/cartão Nubank
//   "recebi 3000 de salário"                  → receita recebida hoje, Salário
//   "comprei tênis 300 em 3x no cartão"       → compra no cartão em 3 parcelas
//   "conta de luz 120 vence dia 10"           → despesa a pagar com vencimento dia 10
//   "quanto gastei este mês?" · "saldo" · "posso gastar 200 em lazer?" · "dicas"
import type { Account, Category, CreditCard, FinanceData } from "../types";
import { PAYMENT_METHODS } from "../types";
import { addDays, addMonths, daysInMonth, monthEnd, monthKey, monthLabelFull, monthStart, parts, toISO, weekday, type ISODate } from "./dates";
import { accountBalance } from "./ledger";
import { formatMoney, formatPct, sum } from "./money";
import { buildEntries, budgetStatus, byCategory, entriesIn, recurringExpenses, rootCategory, totals, type Entry } from "./reports";
import { analyze } from "./insights";

// ---------------------------------------------------------------- tipos

export interface DraftEntry {
  kind: "despesa" | "receita";
  /** "conta" = lançamento em conta (pago ou a pagar); "cartao" = compra no cartão de crédito */
  via: "conta" | "cartao";
  description: string;
  amount: number; // centavos
  date: ISODate; // data do pagamento/recebimento ou vencimento; na compra no cartão, data da compra
  paid: boolean;
  categoryId: string | null;
  accountId: string | null;
  cardId: string | null;
  installments: number;
  paymentMethod: string;
  /** o que foi deduzido e não dito explicitamente (mostrado para a pessoa conferir) */
  guessed: ("categoria" | "conta" | "data" | "cartao")[];
  original: string;
}

export type Reply =
  | { type: "lancamentos"; items: DraftEntry[]; problems: string[] }
  | { type: "posso_gastar"; amount: number; categoryId: string | null }
  | { type: "resumo"; title: string; lines: string[] }
  | { type: "saldo"; title: string; lines: string[] }
  | { type: "dicas"; tips: Tip[] }
  | { type: "ajuda" }
  | { type: "nao_entendi"; text: string };

export interface Tip {
  id: string;
  tone: "positivo" | "alerta" | "perigo" | "info";
  title: string;
  text: string;
}

export interface Ctx {
  data: FinanceData;
  today: ISODate;
  entries?: Entry[];
}

// ---------------------------------------------------------------- texto

/** minúsculas, sem acento, espaços simples */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escRe(word)}([^a-z0-9]|$)`).test(text);
}

// ---------------------------------------------------------------- dicionários

const VERBOS_DESPESA = ["gastei", "gasto", "gastamos", "paguei", "pago", "pagamos", "comprei", "compramos", "comprado", "despesa", "saiu", "torrei", "debitou", "debitado", "cobraram", "cobrado"];
const VERBOS_RECEITA = ["recebi", "recebemos", "ganhei", "ganhamos", "entrou", "entraram", "caiu", "receita", "vendi", "vendemos", "rendeu", "renderam", "reembolso", "reembolsaram", "devolveram"];
const FUTURO = ["vou pagar", "vou receber", "a pagar", "a receber", "vence", "vencimento", "pagar dia", "receber dia", "tenho que pagar", "preciso pagar", "vai cair", "vai entrar", "agendado", "agendei", "boleto de"];

/** palavra-chave → categoria padrão do app (as categorias criadas no cadastro) */
const PALAVRAS_CATEGORIA: [string, string[]][] = [
  ["Alimentação", ["mercado", "supermercado", "padaria", "acougue", "feira", "hortifruti", "sacolao", "atacadao", "assai", "carrefour", "pao de acucar", "guanabara", "prezunic", "ifood", "lanche", "lanchonete", "restaurante", "almoco", "jantar", "comida", "pizza", "hamburguer", "cafe", "delivery", "rappi", "marmita", "acai", "sorvete", "bebida", "agua mineral"]],
  ["Transporte", ["uber", "99", "99pop", "onibus", "metro", "trem", "barca", "passagem", "taxi", "estacionamento", "pedagio", "riocard", "bilhete unico", "brt", "vlt", "van", "mototaxi", "lavagem do carro", "lava jato", "mecanico", "oficina", "pneu"]],
  ["Combustível", ["gasolina", "combustivel", "etanol", "alcool", "diesel", "gnv", "posto", "abasteci", "abastecer"]],
  ["Moradia", ["aluguel", "condominio", "reforma", "material de construcao", "moveis", "movel", "faxina", "diarista"]],
  ["Contas domésticas", ["luz", "energia", "light", "enel", "agua", "cedae", "esgoto", "gas", "botijao", "internet", "telefone", "conta de celular", "plano de celular", "recarga", "tv a cabo", "sky"]],
  ["Saúde", ["farmacia", "drogaria", "remedio", "medicamento", "medico", "consulta", "dentista", "exame", "plano de saude", "academia", "psicologo", "terapia", "hospital", "clinica", "otica", "oculos"]],
  ["Educação", ["curso", "escola", "faculdade", "mensalidade escolar", "livro", "material escolar", "apostila", "ingles", "matricula", "uniforme escolar"]],
  ["Lazer", ["cinema", "show", "bar", "cerveja", "chopp", "viagem", "passeio", "ingresso", "festa", "balada", "parque", "hotel", "pousada", "airbnb", "jogo", "praia"]],
  ["Assinaturas", ["netflix", "spotify", "prime video", "amazon prime", "disney", "hbo", "max", "youtube premium", "globoplay", "deezer", "icloud", "google one", "chatgpt", "assinatura", "mensalidade do app", "paramount", "crunchyroll"]],
  ["Impostos", ["iptu", "ipva", "imposto", "darf", "das mei", "licenciamento", "taxa do detran", "multa"]],
  ["Compras", ["roupa", "roupas", "tenis", "sapato", "camisa", "calca", "vestido", "loja", "shopping", "presente", "eletronico", "fone", "notebook", "celular novo", "comprei um celular", "maquiagem", "perfume", "shopee", "shein", "mercado livre", "amazon", "magalu", "cosmetico", "salao", "cabelo", "barbeiro", "manicure"]],
  ["Empréstimos e financiamentos", ["emprestimo", "financiamento", "parcela do carro", "consignado"]],
  ["Salário", ["salario", "holerite", "pagamento do mes", "decimo terceiro", "13o", "ferias", "adiantamento"]],
  ["Serviços", ["freela", "freelance", "servico", "bico", "consultoria", "diaria", "trabalho"]],
  ["Vendas", ["vendi", "venda", "vendemos"]],
  ["Trabalho extra", ["hora extra", "extra", "plantao", "comissao", "bonus", "gorjeta"]],
  ["Rendimentos", ["rendimento", "rendeu", "juros", "dividendo", "dividendos", "cdb", "tesouro", "poupanca rendeu", "cashback"]],
];

const METODOS: [string, string[]][] = [
  ["Débito automático", ["debito automatico"]],
  ["Pix", ["pix"]],
  ["Débito", ["debito", "no debito", "cartao de debito"]],
  ["Dinheiro", ["dinheiro", "em especie", "especie", "vivo"]],
  ["Boleto", ["boleto"]],
  ["Transferência", ["transferencia", "ted", "doc"]],
];

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

// ---------------------------------------------------------------- extração

interface Peca { ini: number; fim: number }
function remover(texto: string, pecas: Peca[]): string {
  let out = texto;
  for (const p of [...pecas].sort((a, b) => b.ini - a.ini)) out = out.slice(0, p.ini) + " ".repeat(p.fim - p.ini) + out.slice(p.fim);
  return out;
}

/** Datas: hoje, ontem, anteontem, amanhã, "dia 5", 05/11, 05/11/2026, "segunda", "semana passada", "5 de novembro". */
export function extrairData(t: string, today: ISODate, passado: boolean): { date: ISODate | null; pecas: Peca[] } {
  const pecas: Peca[] = [];
  let date: ISODate | null = null;
  const marca = (m: RegExpExecArray) => pecas.push({ ini: m.index, fim: m.index + m[0].length });
  const { y, m: mes, d } = parts(today);
  let r: RegExpExecArray | null;

  if ((r = /\b(anteontem|antes de ontem)\b/.exec(t))) { date = addDays(today, -2); marca(r); }
  else if ((r = /\bontem\b/.exec(t))) { date = addDays(today, -1); marca(r); }
  else if ((r = /\b(depois de amanha)\b/.exec(t))) { date = addDays(today, 2); marca(r); }
  else if ((r = /\bamanha\b/.exec(t))) { date = addDays(today, 1); marca(r); }
  else if ((r = /\bhoje\b/.exec(t))) { date = today; marca(r); }
  else if ((r = /\bsemana passada\b/.exec(t))) { date = addDays(today, -7); marca(r); }
  else if ((r = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) {
    const dd = +r[1], mm = +r[2];
    let yy = r[3] ? +r[3] : y;
    if (yy < 100) yy += 2000;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= daysInMonth(yy, mm)) {
      date = toISO(yy, mm, dd);
      if (!r[3] && passado && date > today) date = toISO(yy - 1, mm, dd);
      marca(r);
    }
  } else if ((r = new RegExp(`\\b(?:dia )?(\\d{1,2}) de (${MESES.join("|")})(?: de (\\d{4}))?\\b`).exec(t))) {
    const dd = +r[1], mm = MESES.indexOf(r[2]) + 1;
    let yy = r[3] ? +r[3] : y;
    if (dd >= 1 && dd <= daysInMonth(yy, mm)) {
      date = toISO(yy, mm, dd);
      if (!r[3] && passado && date > today) { yy -= 1; date = toISO(yy, mm, dd); }
      marca(r);
    }
  } else if ((r = /\b(?:no |em |para o |pro )?dia (\d{1,2})\b/.exec(t))) {
    const dd = +r[1];
    if (dd >= 1 && dd <= 31) {
      let cand = toISO(y, mes, Math.min(dd, daysInMonth(y, mes)));
      if (passado && dd > d) { const prev = addMonths(monthStart(today), -1); const p = parts(prev); cand = toISO(p.y, p.m, Math.min(dd, daysInMonth(p.y, p.m))); }
      if (!passado && dd < d) { const nx = addMonths(monthStart(today), 1); const p = parts(nx); cand = toISO(p.y, p.m, Math.min(dd, daysInMonth(p.y, p.m))); }
      date = cand; marca(r);
    }
  } else if ((r = new RegExp(`\\b(?:na |no |nesta |neste |essa |esta |ultima |ultimo )?(${DIAS_SEMANA.join("|")})(?:-feira| feira)?\\b`).exec(t))) {
    const alvo = DIAS_SEMANA.indexOf(r[1]), hoje = weekday(today);
    let diff = passado ? (hoje - alvo + 7) % 7 : (alvo - hoje + 7) % 7;
    if (diff === 0 && /ultim|passad/.test(r[0])) diff = 7;
    date = addDays(today, passado ? -diff : diff); marca(r);
  }
  return { date, pecas };
}

/** Parcelas: "3x", "em 3 vezes", "10 parcelas", "parcelado em 4". "à vista" = 1. */
export function extrairParcelas(t: string): { n: number; pecas: Peca[] } {
  const pecas: Peca[] = [];
  let r: RegExpExecArray | null;
  if ((r = /\b(?:em |parcelad[oa] em )?(\d{1,2}) ?x\b(?: sem juros| de [\d.,]+)?/.exec(t)) || (r = /\b(?:em |parcelad[oa] em )(\d{1,2}) (?:vezes|parcelas)\b/.exec(t)) || (r = /\b(\d{1,2}) (?:vezes|parcelas)\b/.exec(t))) {
    const n = +r[1];
    if (n >= 1 && n <= 48) { pecas.push({ ini: r.index, fim: r.index + r[0].length }); return { n, pecas }; }
  }
  if ((r = /\ba vista\b/.exec(t))) { pecas.push({ ini: r.index, fim: r.index + r[0].length }); return { n: 1, pecas }; }
  return { n: 1, pecas };
}

/** Valor em centavos: "45", "45,90", "R$ 1.234,56", "1,2 mil", "2k", "50 reais", "3 mil". */
export function extrairValor(t: string): { valor: number | null; pecas: Peca[] } {
  const re = /(r\$ ?)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?:\.(\d{1,2}))?( ?mil\b| ?k\b)?( ?reais| ?real| ?conto[s]?| ?pila[s]?)?/g;
  let r: RegExpExecArray | null, melhor: { v: number; peca: Peca; forte: boolean } | null = null;
  while ((r = re.exec(t))) {
    const antes = t.slice(Math.max(0, r.index - 1), r.index);
    if (/[a-z0-9]/.test(antes)) continue; // parte de outra palavra (ex.: "99pop" é tratado como transporte)
    const inteiro = r[2].replace(/\./g, "");
    const dec = r[3] ?? r[4] ?? "";
    let v = Number(inteiro) * 100 + Number((dec + "00").slice(0, 2));
    if (r[5]) v *= 1000;
    if (!v) continue;
    const forte = !!(r[1] || r[6] || r[5] || dec);
    const peca = { ini: r.index, fim: r.index + r[0].length };
    if (!melhor || (forte && !melhor.forte)) melhor = { v, peca, forte };
  }
  return melhor ? { valor: melhor.v, pecas: [melhor.peca] } : { valor: null, pecas: [] };
}

function acharCategoria(t: string, cats: Category[], kind: "despesa" | "receita"): { id: string | null; pecas: Peca[]; certeza: boolean } {
  const doTipo = cats.filter((c) => c.kind === kind);
  // 1) nome de uma categoria sua escrito na frase (subcategorias primeiro, nomes mais longos primeiro)
  const ordem = [...doTipo].sort((a, b) => (b.parent_id ? 1 : 0) - (a.parent_id ? 1 : 0) || norm(b.name).length - norm(a.name).length);
  for (const c of ordem) {
    const n = norm(c.name);
    if (n.length >= 3 && hasWord(t, n)) { const i = t.indexOf(n); return { id: c.id, pecas: [{ ini: i, fim: i + n.length }], certeza: true }; }
  }
  // 2) palavras-chave → categoria padrão com o mesmo nome
  let melhor: { cat: string; len: number; ini: number } | null = null;
  for (const [cat, palavras] of PALAVRAS_CATEGORIA) {
    for (const p of palavras) {
      if (hasWord(t, p) && (!melhor || p.length > melhor.len)) {
        const alvo = doTipo.find((c) => norm(c.name) === norm(cat));
        if (alvo) melhor = { cat: alvo.id, len: p.length, ini: t.search(new RegExp(`(^|[^a-z0-9])${escRe(p)}`)) };
      }
    }
  }
  if (melhor) return { id: melhor.cat, pecas: [], certeza: true };
  // 3) categoria genérica do tipo
  const generica = doTipo.find((c) => ["outros", "outras receitas", "outras despesas"].includes(norm(c.name)) && !c.parent_id);
  return { id: generica?.id ?? null, pecas: [], certeza: false };
}

/** Categoria provável para um texto qualquer (usada também na sincronização com o banco). */
export function sugerirCategoria(texto: string, cats: Category[], kind: "despesa" | "receita"): { id: string | null; certeza: boolean } {
  const r = acharCategoria(norm(texto), cats, kind);
  return { id: r.id, certeza: r.certeza };
}

function nomesDe(x: Account | CreditCard): string[] {
  const out = [norm(x.name)];
  if ("institution" in x && x.institution) out.push(norm(x.institution));
  // "Nubank Roxinho" também casa com "nubank"; "Conta Itaú" com "itau"
  for (const w of norm(x.name).split(" ")) if (w.length >= 4 && !["conta", "cartao", "credito", "debito", "corrente", "poupanca", "carteira"].includes(w)) out.push(w);
  return [...new Set(out)].filter((s) => s.length >= 2);
}
function acharPorNome<T extends Account | CreditCard>(t: string, lista: T[]): { item: T | null; pecas: Peca[] } {
  let melhor: { item: T; len: number; ini: number } | null = null;
  for (const x of lista) for (const n of nomesDe(x)) {
    if (hasWord(t, n) && (!melhor || n.length > melhor.len)) melhor = { item: x, len: n.length, ini: t.search(new RegExp(`(^|[^a-z0-9])${escRe(n)}`)) };
  }
  if (!melhor) return { item: null, pecas: [] };
  const ini = melhor.ini < 0 ? 0 : melhor.ini + (t[melhor.ini] === " " ? 1 : 0);
  return { item: melhor.item, pecas: [{ ini, fim: ini + melhor.len }] };
}

/** conta usada com mais frequência nos últimos 90 dias (ou a primeira ativa) */
export function contaPadrao(data: FinanceData, today: ISODate): string | null {
  const ativas = data.accounts.filter((a) => !a.archived);
  if (!ativas.length) return null;
  const desde = addDays(today, -90), uso = new Map<string, number>();
  for (const t of data.transactions) if (t.account_id && t.due_date >= desde && (t.kind === "despesa" || t.kind === "receita")) uso.set(t.account_id, (uso.get(t.account_id) ?? 0) + 1);
  const top = ativas.map((a) => ({ a, n: uso.get(a.id) ?? 0 })).sort((x, y) => y.n - x.n || (x.a.type === "corrente" ? -1 : 0) - (y.a.type === "corrente" ? -1 : 0))[0];
  return top.a.id;
}

const PALAVRAS_DESCARTE = new Set([
  "eu", "nos", "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "em", "com", "pra", "pro", "para", "por", "pelo", "pela",
  "e", "que", "foi", "foram", "hoje", "ontem", "reais", "real", "r$", "conta", "cartao", "credito", "debito", "via", "pelo", "meu", "minha", "mais", "valor", "total", "ja", "agora",
  "parcelado", "parcelada", "vezes", "parcelas", "sem", "juros", "vista", "dia", "mes", "ano", "semana", "passada", "passado", "uns", "so", "tambem", "aqui", "la", "isso", "esse", "essa",
  ...VERBOS_DESPESA, ...VERBOS_RECEITA, "vou", "pagar", "receber", "vence", "vencimento", "tenho", "preciso", "vai", "cair", "entrar", "agendado", "agendei",
]);

function descricao(resto: string, catNome: string | null, original: string): string {
  const palavras = resto.split(/[^a-z0-9$]+/).filter((w) => w && !PALAVRAS_DESCARTE.has(w) && !/^\d+$/.test(w) && !METODOS.some(([, ps]) => ps.includes(w)));
  if (!palavras.length) return catNome ?? (original.trim().slice(0, 60) || "Lançamento");
  // recupera a grafia original (com acento) das palavras mantidas
  const origPalavras = original.split(/\s+/);
  const bonitas = palavras.map((w) => origPalavras.find((o) => norm(o).replace(/[^a-z0-9$]/g, "") === w)?.replace(/[^\p{L}\p{N}$]/gu, "") || w);
  const s = bonitas.slice(0, 8).join(" ");
  return (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 120);
}

// ---------------------------------------------------------------- lançamentos

const VERBOS_RE = [...VERBOS_DESPESA, ...VERBOS_RECEITA].join("|");
// separa "almoço 32 e uber 18", "gastei 50 no mercado, paguei 20 de uber", uma por linha ou com ";"
const SEPARADOR = new RegExp(
  String.raw`\n|;|\s+(?:e|mais|tamb[eé]m)\s+(?=(?:r\$ ?)?\d)|,\s+(?=(?:r\$ ?)?\d)|\s+e\s+(?=(?:depois |tamb[eé]m )?(?:${VERBOS_RE})\b)|,\s+(?=(?:${VERBOS_RE})\b)`,
  "i",
);
function dividirFrases(texto: string): string[] {
  const out: string[] = [];
  for (const parte of texto.split(SEPARADOR).map((s) => s.trim()).filter(Boolean)) {
    // "almoço 32 e uber 18": divide no " e " quando os dois lados têm valor
    const pedacos = parte.split(/\s+e\s+/i);
    if (pedacos.length > 1 && pedacos.every((p) => /\d/.test(p))) out.push(...pedacos);
    else out.push(parte);
  }
  return out;
}

export function interpretarLancamento(frase: string, ctx: Ctx, herdado?: Partial<DraftEntry>): DraftEntry | null {
  const { data, today } = ctx;
  const t = norm(frase);

  const temReceita = VERBOS_RECEITA.some((w) => hasWord(t, w)) || /\b(salario|freela|freelance|rendimento|dividendo|pix recebido|receber|recebimento)\b/.test(t);
  const temDespesa = VERBOS_DESPESA.some((w) => hasWord(t, w));
  const kind: "despesa" | "receita" = temReceita && !temDespesa ? "receita" : temDespesa ? "despesa" : herdado?.kind ?? "despesa";
  const futuro = FUTURO.some((w) => t.includes(w));

  // ordem: parcelas e data primeiro, para "dia 5" ou "3x" não serem lidos como valor
  const p = extrairParcelas(t);
  const d = extrairData(remover(t, p.pecas), today, !futuro);
  const v = extrairValor(remover(t, [...p.pecas, ...d.pecas]));
  if (v.valor == null) return null;
  const resto0 = remover(t, [...v.pecas, ...p.pecas, ...d.pecas]);

  const ativas = data.accounts.filter((a) => !a.archived), cartoes = data.cards.filter((c) => !c.archived);
  const conta = acharPorNome(resto0, ativas), cartao = acharPorNome(resto0, cartoes);
  const falaCartao = /\b(cartao|credito|no credito|fatura)\b/.test(t) && !/\bcartao de debito\b/.test(t);
  const falaDebito = /\b(debito|pix|dinheiro|boleto|transferencia)\b/.test(t);

  let via: "conta" | "cartao" = "conta";
  if (kind === "despesa" && !futuro) {
    if (falaCartao || p.n > 1) via = "cartao";
    else if (cartao.item && !conta.item && !falaDebito) via = "cartao";
  }
  if (via === "cartao" && !cartoes.length) via = "conta";

  const guessed: DraftEntry["guessed"] = [];
  let cardId: string | null = null, accountId: string | null = null;
  if (via === "cartao") {
    cardId = cartao.item?.id ?? (cartoes.length === 1 ? cartoes[0].id : herdado?.cardId ?? null);
    if (!cartao.item) guessed.push("cartao");
  } else {
    accountId = conta.item?.id ?? herdado?.accountId ?? contaPadrao(data, today);
    if (!conta.item) guessed.push("conta");
  }

  const resto = remover(resto0, [...conta.pecas, ...cartao.pecas]);
  const cat = acharCategoria(resto, data.categories, kind);
  if (!cat.certeza) guessed.push("categoria");
  const catObj = data.categories.find((c) => c.id === cat.id) ?? null;
  const date = d.date ?? herdado?.date ?? today;
  if (!d.date && !herdado?.date) guessed.push("data");

  let metodo = "";
  for (const [m, ps] of METODOS) if (ps.some((w) => hasWord(t, w))) { metodo = m; break; }
  if (!metodo && kind === "despesa" && via === "conta") metodo = herdado?.paymentMethod || "Pix";
  if (!PAYMENT_METHODS.includes(metodo) && metodo) metodo = "Outro";

  const paid = via === "cartao" ? true : !futuro && date <= today;
  return {
    kind, via,
    description: descricao(remover(resto, cat.pecas).replace(/\s+/g, " "), catObj?.name ?? null, frase),
    amount: v.valor,
    date,
    paid,
    categoryId: cat.id,
    accountId, cardId,
    installments: via === "cartao" ? p.n : 1,
    paymentMethod: via === "cartao" ? "" : metodo,
    guessed,
    original: frase.trim(),
  };
}

// ---------------------------------------------------------------- consultas

function periodoDaPergunta(t: string, today: ISODate): { from: ISODate; to: ISODate; nome: string } {
  if (/\bhoje\b/.test(t)) return { from: today, to: today, nome: "hoje" };
  if (/\bontem\b/.test(t)) { const o = addDays(today, -1); return { from: o, to: o, nome: "ontem" }; }
  if (/\bsemana passada\b/.test(t)) { const ini = addDays(today, -weekday(today) - 7); return { from: ini, to: addDays(ini, 6), nome: "na semana passada" }; }
  if (/\b(semana|7 dias)\b/.test(t)) { const ini = addDays(today, -weekday(today)); return { from: ini, to: today, nome: "nesta semana" }; }
  if (/\bmes passado\b|\bultimo mes\b/.test(t)) { const ini = addMonths(monthStart(today), -1); return { from: ini, to: monthEnd(ini), nome: `em ${monthLabelFull(monthKey(ini))}` }; }
  if (/\bano\b/.test(t)) { const y = parts(today).y; return { from: toISO(y, 1, 1), to: today, nome: `em ${y}` }; }
  for (let i = 0; i < 12; i++) if (hasWord(t, MESES[i])) {
    const y = parts(today).y, ini = toISO(i + 1 > parts(today).m ? y - 1 : y, i + 1, 1);
    return { from: ini, to: monthEnd(ini), nome: `em ${monthLabelFull(monthKey(ini))}` };
  }
  // mês atual inteiro: inclui o que ainda vai vencer (a resposta separa o que já foi pago)
  return { from: monthStart(today), to: monthEnd(today), nome: "neste mês" };
}

function resumo(t: string, ctx: Ctx): Reply {
  const { data, today } = ctx;
  const entries = ctx.entries ?? buildEntries(data);
  const per = periodoDaPergunta(t, today);
  const lista = entriesIn(entries, per.from, per.to);
  const tipo: "despesa" | "receita" | null = /\b(ganhei|recebi|entrou|receitas?|ganhos?)\b/.test(t) ? "receita" : /\b(gastei|gastos?|despesas?|paguei|saiu)\b/.test(t) ? "despesa" : null;
  // categoria citada na pergunta
  const tipoCat = tipo ?? "despesa";
  const cat = acharCategoria(t.replace(/\b(quanto|gastei|ganhei|recebi|com|em|de|no|na|este|esse|neste|nesse|mes|semana|hoje|ontem|passado|passada)\b/g, " "), data.categories, tipoCat);
  const tot = totals(lista);
  if (cat.certeza && cat.id) {
    const raiz = rootCategory(data.categories, cat.id);
    const linha = byCategory(lista, data.categories, tipoCat).find((c) => c.id === (raiz?.id ?? cat.id));
    const nome = data.categories.find((c) => c.id === cat.id)?.name ?? "categoria";
    const valor = linha?.amount ?? 0;
    const lines = [`${formatMoney(valor)} em ${nome} ${per.nome}.`];
    const base = tipoCat === "despesa" ? tot.despesas : tot.receitas;
    if (valor && base) lines.push(`É ${formatPct((valor / base) * 100)} do total de ${tipoCat === "despesa" ? "despesas" : "receitas"} do período (${formatMoney(base)}).`);
    const b = budgetStatus(data.budgets, data.categories, entries, monthKey(today)).find((x) => x.budget.category_id === (raiz?.id ?? cat.id));
    if (b && per.from === monthStart(today)) lines.push(`Orçamento: ${formatMoney(b.spent)} de ${formatMoney(b.budget.amount)} (${formatPct(b.pct)}).`);
    return { type: "resumo", title: `${tipoCat === "despesa" ? "Gastos" : "Ganhos"} com ${nome} ${per.nome}`, lines };
  }
  const lines: string[] = [];
  if (tipo !== "receita") lines.push(`Despesas: ${formatMoney(tot.despesas)}${tot.despesas !== tot.pago ? ` (${formatMoney(tot.pago)} já pagas)` : ""}.`);
  if (tipo !== "despesa") lines.push(`Receitas: ${formatMoney(tot.receitas)}${tot.receitas !== tot.recebido ? ` (${formatMoney(tot.recebido)} já recebidas)` : ""}.`);
  if (!tipo) lines.push(`Resultado: ${tot.saldo >= 0 ? "sobra" : "falta"} de ${formatMoney(Math.abs(tot.saldo))}.`);
  const top = byCategory(lista, data.categories, tipo ?? "despesa").slice(0, 3);
  if (top.length) lines.push(`Maiores ${tipo === "receita" ? "fontes" : "gastos"}: ${top.map((c) => `${c.name} ${formatMoney(c.amount)}`).join(", ")}.`);
  if (!lista.length) lines.splice(0, lines.length, `Nenhum lançamento ${per.nome}.`);
  const titulo = tipo === "receita" ? `Quanto você ganhou ${per.nome}` : tipo === "despesa" ? `Quanto você gastou ${per.nome}` : `Resumo ${per.nome}`;
  return { type: "resumo", title: titulo, lines };
}

function saldo(ctx: Ctx): Reply {
  const { data } = ctx;
  const ativas = data.accounts.filter((a) => !a.archived);
  if (!ativas.length) return { type: "saldo", title: "Ainda não há contas", lines: ["Cadastre suas contas em Contas para eu acompanhar o saldo."] };
  const linhas = ativas.map((a) => ({ a, s: accountBalance(a, data.transactions) })).sort((x, y) => y.s - x.s);
  const total = sum(linhas.map((l) => l.s));
  return { type: "saldo", title: `Saldo total: ${formatMoney(total)}`, lines: linhas.map((l) => `${l.a.name}: ${formatMoney(l.s)}`) };
}

// ---------------------------------------------------------------- dicas

const ESSENCIAIS = ["moradia", "contas domesticas", "alimentacao", "transporte", "combustivel", "saude", "educacao", "impostos", "emprestimos e financiamentos"];

export function dicas(ctx: Ctx): Tip[] {
  const { data, today } = ctx;
  const entries = ctx.entries ?? buildEntries(data);
  const tips: Tip[] = analyze(data, today, entries).map((i) => ({ ...i }));
  if (tips.length === 1 && tips[0].id === "vazio") return tips;

  // últimos 3 meses fechados
  const ini = addMonths(monthStart(today), -3), fim = addDays(monthStart(today), -1);
  const prev = entriesIn(entries, ini, fim);
  const meses = new Set(prev.map((e) => monthKey(e.date))).size || 1;
  const rec = sum(prev.filter((e) => e.type === "receita").map((e) => e.amount)) / meses;
  const desp = sum(prev.filter((e) => e.type === "despesa").map((e) => e.amount)) / meses;

  // 50/30/20
  if (rec > 0 && desp > 0) {
    const cats = byCategory(prev, data.categories, "despesa");
    const essenciais = sum(cats.filter((c) => ESSENCIAIS.includes(norm(c.name))).map((c) => c.amount)) / meses;
    const desejos = desp - essenciais;
    const sobra = rec - desp;
    const pe = (essenciais / rec) * 100, pd = (desejos / rec) * 100, ps = (sobra / rec) * 100;
    const fora = pe > 55 || pd > 35 || ps < 15;
    tips.push({
      id: "503020", tone: fora ? "alerta" : "positivo",
      title: "Regra 50/30/20 (média dos últimos meses)",
      text: `Do que entra por mês: ${formatPct(pe)} vai para o essencial (ideal até 50%), ${formatPct(pd)} para o resto (ideal até 30%) e ${formatPct(Math.max(ps, 0))} sobra (ideal 20% ou mais).` +
        (ps < 15 ? " Tente separar uma quantia fixa assim que o dinheiro entrar, antes de gastar." : pd > 35 ? " Os gastos não essenciais estão acima do ideal: comece pelas assinaturas e pedidos por aplicativo." : ""),
    });
  }

  // reserva de emergência
  const reserva = data.goals.find((g) => g.kind === "reserva");
  if (desp > 0) {
    const alvo = Math.round(desp * 6);
    if (!reserva) tips.push({ id: "reserva", tone: "info", title: "Reserva de emergência", text: `O recomendado é guardar de 3 a 6 meses de gastos. Para você, algo entre ${formatMoney(Math.round(desp * 3))} e ${formatMoney(alvo)}. Crie a meta em Planejamento para acompanhar.` });
    else if (reserva.saved < reserva.target) tips.push({ id: "reserva", tone: "info", title: "Reserva de emergência", text: `Você já guardou ${formatMoney(reserva.saved)} de ${formatMoney(reserva.target)} (${formatPct((reserva.saved / reserva.target) * 100)}). ${reserva.saved < desp * 3 ? "Priorize chegar a 3 meses de gastos antes de investir em outras metas." : "Bom ritmo: mantenha os depósitos todo mês."}` });
  }

  // assinaturas
  const assin = data.categories.find((c) => norm(c.name) === "assinaturas");
  if (assin) {
    const recs = recurringExpenses(data.transactions, data.categories, today).filter((r) => r.active && r.category?.id === assin.id);
    const valorMes = sum(entriesIn(entries, monthStart(today), monthEnd(today)).filter((e) => e.type === "despesa" && rootCategory(data.categories, e.category_id)?.id === assin.id).map((e) => e.amount));
    if (valorMes >= 5000 || recs.length >= 3) tips.push({ id: "assinaturas", tone: "info", title: "Assinaturas", text: `${formatMoney(valorMes)} em assinaturas neste mês. Revise o que você não usou nos últimos 30 dias: cancelar uma única assinatura costuma render mais de R$ 400 por ano.` });
  }

  // cartão: parcelas futuras pesando
  const futuras = data.installments.filter((i) => i.invoice_month > monthStart(today));
  const prox3 = sum(futuras.filter((i) => i.invoice_month <= addMonths(monthStart(today), 3)).map((i) => i.amount)) / 3;
  if (rec > 0 && prox3 > rec * 0.25) tips.push({ id: "parcelas", tone: "alerta", title: "Parcelas já comprometidas", text: `Nos próximos 3 meses, as parcelas que você já tem no cartão somam em média ${formatMoney(Math.round(prox3))} por mês (${formatPct((prox3 / rec) * 100)} do que entra). Evite novas compras parceladas até elas baixarem.` });

  // sem orçamento
  if (!data.budgets.length && desp > 0) {
    const top = byCategory(prev, data.categories, "despesa")[0];
    if (top) tips.push({ id: "orcamento", tone: "info", title: "Defina limites por categoria", text: `Você ainda não tem orçamento. Comece por ${top.name} (média de ${formatMoney(Math.round(top.amount / meses))} por mês): um limite 10% menor libera cerca de ${formatMoney(Math.round(top.amount / meses / 10))} por mês. Configure em Planejamento.` });
  }

  // contas atrasadas
  const atrasadas = data.transactions.filter((x) => (x.kind === "despesa") && !x.paid_date && x.due_date < today);
  if (atrasadas.length) tips.push({ id: "atrasadas", tone: "perigo", title: "Contas em atraso", text: `${atrasadas.length} ${atrasadas.length === 1 ? "conta está" : "contas estão"} em atraso, somando ${formatMoney(sum(atrasadas.map((x) => x.amount)))}. Pague primeiro as que cobram juros e multa maiores (cartão e cheque especial) e negocie as demais.` });

  return tips;
}

// ---------------------------------------------------------------- roteador

export function responder(texto: string, ctx: Ctx): Reply {
  const t = norm(texto);
  if (!t) return { type: "nao_entendi", text: "Escreva um gasto, um ganho ou uma pergunta." };
  if (/^(ajuda|help|\?|o que (voce|vc) faz|como (funciona|usar)|exemplos?)\b/.test(t)) return { type: "ajuda" };
  if (/\b(dica|dicas|conselho|conselhos|como (economizar|poupar|guardar)|analise|analisar|me ajuda a economizar|onde (posso )?economizar)\b/.test(t)) return { type: "dicas", tips: dicas(ctx) };
  if (/\bposso (gastar|comprar|pagar)\b|\bda (pra|para) (gastar|comprar)\b|\bcabe no (bolso|orcamento)\b/.test(t)) {
    const v = extrairValor(t).valor;
    if (!v) return { type: "nao_entendi", text: "Diga o valor. Exemplo: \"posso gastar 150 em lazer?\"" };
    const cat = acharCategoria(t, ctx.data.categories, "despesa");
    return { type: "posso_gastar", amount: v, categoryId: cat.certeza ? cat.id : null };
  }
  if (/^(qual|quanto|meu|minha)?\s*(e |eh )?(o |a )?(meu |minha )?saldo\b|\bsaldo (total|das contas|atual)\b|\bquanto (eu )?tenho\b/.test(t)) return saldo(ctx);
  if (/\bquanto\b|\bresumo\b|\bbalanco\b|\bcomo (estou|to|tou|estao)\b|\btotal (de |do |da )?(gastos?|despesas?|receitas?)\b/.test(t) && !/\b(gastei|paguei|recebi|ganhei|comprei) (r\$ ?)?\d/.test(t)) return resumo(t, ctx);

  const frases = dividirFrases(texto);
  const items: DraftEntry[] = [], problems: string[] = [];
  let herdado: Partial<DraftEntry> | undefined;
  for (const f of frases) {
    const d = interpretarLancamento(f, ctx, herdado);
    if (d) { items.push(d); herdado = d; }
    else if (frases.length > 1) problems.push(`Não achei o valor em "${f}".`);
  }
  if (items.length) {
    for (const it of items) {
      if (it.via === "cartao" && !it.cardId) problems.push(`Escolha o cartão de "${it.description}".`);
      if (it.via === "conta" && it.paid && !it.accountId) problems.push(`Cadastre uma conta em Contas para registrar "${it.description}" como pago.`);
    }
    return { type: "lancamentos", items, problems };
  }
  return { type: "nao_entendi", text: "Não entendi. Escreva com o valor, por exemplo: \"gastei 45 no mercado\", \"recebi 3000 de salário\", ou pergunte \"quanto gastei este mês?\"." };
}

export const EXEMPLOS = [
  "gastei 45,90 no mercado ontem",
  "paguei 120 de luz no pix",
  "comprei um tênis de 300 em 3x no cartão",
  "recebi 3500 de salário dia 5",
  "conta de internet 99 vence dia 15",
  "almoço 32 e uber 18",
  "quanto gastei este mês?",
  "quanto gastei com alimentação?",
  "posso gastar 200 em lazer?",
  "saldo",
  "dicas",
];
