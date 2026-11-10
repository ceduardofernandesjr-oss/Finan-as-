import { NextResponse, type NextRequest } from "next/server";
import { fail, getItem, HttpError, listAccounts, listTransactions, requireUser } from "@/lib/pluggy/server";
import type { BankTx } from "@/lib/finance/bank-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const hojeBR = (dias = 0) => new Date(Date.now() - 3 * 3600_000 + dias * 86400_000).toISOString().slice(0, 10);

/**
 * Busca no banco os lançamentos novos de uma conexão: só das contas mapeadas, a partir da data escolhida,
 * sem os que já foram importados ou ignorados. Nada é gravado aqui.
 */
export async function POST(req: NextRequest) {
  try {
    const { sb, user } = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { linkId?: unknown };
    const linkId = typeof body.linkId === "string" ? body.linkId : "";
    // RLS: só encontra conexões da própria pessoa
    const { data: links, error } = await sb.from("bank_links").select("*").eq("id", linkId);
    if (error) throw new HttpError(500, error.message);
    const link = (links ?? []).find((l) => l.id === linkId && l.user_id === user.id);
    if (!link) throw new HttpError(404, "Conexão não encontrada.");
    const { data: maps, error: e2 } = await sb.from("bank_link_accounts").select("*").eq("link_id", link.id);
    if (e2) throw new HttpError(500, e2.message);
    const ativos = (maps ?? []).filter((m) => m.link_id === link.id && m.user_id === user.id && m.enabled && (m.account_id || m.card_id));

    const [item, contasBanco] = await Promise.all([getItem(link.item_id), listAccounts(link.item_id)]);
    const doItem = new Set(contasBanco.map((a) => a.id));
    const itens: BankTx[] = [];
    for (const m of ativos) {
      if (!doItem.has(m.external_id)) continue; // a conta precisa ser deste item
      itens.push(...(await listTransactions(m.external_id, m.kind, m.sync_from, m.kind === "cartao" ? hojeBR(400) : hojeBR())));
    }

    // tira o que já foi tratado antes (importado ou ignorado)
    const ja = new Set<string>();
    const ids = [...new Set(itens.map((t) => t.id))];
    for (let i = 0; i < ids.length; i += 150) {
      const lote = ids.slice(i, i + 150);
      const { data, error: e3 } = await sb.from("bank_imports").select("external_id").in("external_id", lote);
      if (e3) throw new HttpError(500, e3.message);
      for (const r of data ?? []) if (lote.includes(r.external_id)) ja.add(r.external_id);
    }
    const vistos = new Set<string>();
    const novos = itens.filter((t) => !ja.has(t.id) && !vistos.has(t.id) && vistos.add(t.id));
    return NextResponse.json({ item, accounts: contasBanco, items: novos, total: itens.length });
  } catch (e) {
    return fail(e);
  }
}
