import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

// Link do e-mail de confirmação de cadastro e de recuperação de senha.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("proximo");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  const supabase = await supabaseServer();

  let error: string | null = null;
  if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code);
    error = r.error?.message ?? null;
  } else if (tokenHash && type) {
    const r = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    error = r.error?.message ?? null;
  } else {
    error = "Link inválido";
  }

  if (error) return NextResponse.redirect(new URL(`/entrar?erro=${encodeURIComponent("O link expirou ou já foi usado. Tente de novo.")}`, url));
  if (safeNext) return NextResponse.redirect(new URL(safeNext, url));
  if (type === "recovery") return NextResponse.redirect(new URL("/redefinir-senha", url));
  return NextResponse.redirect(new URL("/", url));
}
