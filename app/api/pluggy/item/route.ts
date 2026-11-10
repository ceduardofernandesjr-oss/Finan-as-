import { NextResponse, type NextRequest } from "next/server";
import { fail, getItem, HttpError, listAccounts, requireUser } from "@/lib/pluggy/server";

export const dynamic = "force-dynamic";

/** Confere um Item ID da Pluggy e devolve a instituição e as contas/cartões dele. */
export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const body = (await req.json().catch(() => ({}))) as { itemId?: unknown };
    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
    if (!itemId) throw new HttpError(400, "Informe o Item ID.");
    const [item, accounts] = await Promise.all([getItem(itemId), listAccounts(itemId)]);
    return NextResponse.json({ item, accounts });
  } catch (e) {
    return fail(e);
  }
}
