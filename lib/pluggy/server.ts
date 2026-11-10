// Cliente da API da Pluggy. SÓ roda no servidor (rotas em app/api/pluggy): o Client Secret nunca vai ao navegador.
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { importable, normalizeAccount, normalizeTx, type BankAccountInfo, type BankTx } from "@/lib/finance/bank-sync";

const BASE = (process.env.PLUGGY_API_URL || "https://api.pluggy.ai").replace(/\/$/, "");

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function pluggyConfigured(): boolean {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

function allowedEmails(): string[] {
  return (process.env.PLUGGY_ALLOWED_EMAILS ?? "").split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Pessoa logada e autorizada a usar a conexão bancária (lista PLUGGY_ALLOWED_EMAILS). */
export async function requireUser() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new HttpError(401, "Sua sessão expirou. Entre novamente.");
  if (!pluggyConfigured()) throw new HttpError(503, "A conexão bancária ainda não foi configurada no servidor.");
  if (!allowedEmails().includes((user.email ?? "").toLowerCase()))
    throw new HttpError(403, "Seu e-mail não está liberado para a conexão bancária (PLUGGY_ALLOWED_EMAILS).");
  return { sb, user };
}

export async function accessStatus() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  return {
    configured: pluggyConfigured(),
    allowed: !!user && allowedEmails().includes((user.email ?? "").toLowerCase()),
    hasAllowList: allowedEmails().length > 0,
    email: user?.email ?? null,
  };
}

export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("pluggy", e);
  return NextResponse.json({ error: "Não consegui falar com o banco agora. Tente de novo em instantes." }, { status: 502 });
}

// ---------------------------------------------------------------- API da Pluggy

let cached: { key: string; exp: number } | null = null;

async function apiKey(force = false): Promise<string> {
  if (!force && cached && cached.exp > Date.now()) return cached.key;
  const r = await fetch(`${BASE}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: (process.env.PLUGGY_CLIENT_ID ?? "").trim(), clientSecret: (process.env.PLUGGY_CLIENT_SECRET ?? "").trim() }),
    cache: "no-store",
  });
  if (r.status === 401 || r.status === 403) throw new HttpError(502, "A Pluggy recusou o Client ID / Client Secret. Confira as chaves na Vercel.");
  if (!r.ok) throw new HttpError(502, `A Pluggy não respondeu (erro ${r.status}). Tente de novo em instantes.`);
  const j = (await r.json()) as { apiKey?: string };
  if (!j.apiKey) throw new HttpError(502, "Resposta inesperada da Pluggy.");
  cached = { key: j.apiKey, exp: Date.now() + 100 * 60_000 }; // a chave vale 2 h; renovamos antes
  return j.apiKey;
}

async function get<T>(path: string, retry = true): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { "X-API-KEY": await apiKey() }, cache: "no-store" });
  if (r.status === 401 && retry) {
    cached = null;
    return get<T>(path, false);
  }
  if (r.status === 404) throw new HttpError(404, "Conexão não encontrada na Pluggy. Confira o Item ID.");
  if (r.status === 429) throw new HttpError(429, "A Pluggy pediu para esperar um pouco. Tente de novo em 1 minuto.");
  if (!r.ok) throw new HttpError(502, `A Pluggy não respondeu (erro ${r.status}).`);
  return (await r.json()) as T;
}

export const ITEM_ID = /^[A-Za-z0-9-]{8,100}$/;

export interface ItemInfo {
  id: string;
  institution: string;
  status: string;
  executionStatus: string;
  lastUpdatedAt: string | null;
}

export async function getItem(itemId: string): Promise<ItemInfo> {
  if (!ITEM_ID.test(itemId)) throw new HttpError(400, "Item ID inválido.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const it = await get<any>(`/items/${encodeURIComponent(itemId)}`);
  return {
    id: String(it.id),
    institution: String(it.connector?.name ?? "Banco").slice(0, 120),
    status: String(it.status ?? ""),
    executionStatus: String(it.executionStatus ?? ""),
    lastUpdatedAt: it.lastUpdatedAt ?? null,
  };
}

export async function listAccounts(itemId: string): Promise<BankAccountInfo[]> {
  if (!ITEM_ID.test(itemId)) throw new HttpError(400, "Item ID inválido.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await get<{ results: any[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  return (r.results ?? []).map(normalizeAccount);
}

/** Todas as transações da conta no intervalo (páginas de 500). */
export async function listTransactions(accountId: string, kind: "conta" | "cartao", from: string, to: string): Promise<BankTx[]> {
  const out: BankTx[] = [];
  for (let page = 1; page <= 40; page++) {
    const q = new URLSearchParams({ accountId, from, to, pageSize: "500", page: String(page) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await get<{ results: any[]; totalPages?: number }>(`/transactions?${q}`);
    for (const raw of r.results ?? []) {
      const t = normalizeTx({ ...raw, accountId: raw.accountId ?? accountId }, kind);
      if (importable(t, kind)) out.push(t);
    }
    if (!r.totalPages || page >= r.totalPages) break;
  }
  return out;
}
