import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, isConfigured } from "./env";

const PUBLIC = ["/entrar", "/cadastro", "/recuperar-senha", "/auth", "/configurar"];

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (!isConfigured) {
    if (path === "/configurar") return NextResponse.next();
    return NextResponse.redirect(new URL("/configurar", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + "/"));
  if (!user && !isPublic) {
    const url = new URL("/entrar", request.url);
    if (path !== "/") url.searchParams.set("voltar", path);
    return NextResponse.redirect(url);
  }
  if (user && (path === "/entrar" || path === "/cadastro")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}
