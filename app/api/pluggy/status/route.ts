import { NextResponse } from "next/server";
import { accessStatus, fail } from "@/lib/pluggy/server";

export const dynamic = "force-dynamic";

/** Diz se a conexão bancária está configurada e liberada para quem está logado (sem revelar segredos). */
export async function GET() {
  try {
    return NextResponse.json(await accessStatus());
  } catch (e) {
    return fail(e);
  }
}
