export default function Configurar() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-lg space-y-3 rounded-2xl bg-white p-6 text-sm shadow ring-1 ring-slate-200 dark:bg-navy-900 dark:ring-line/60">
        <h1 className="text-lg font-semibold">Falta ligar o app ao Supabase</h1>
        <p>Cadastre estas duas variáveis de ambiente e publique de novo:</p>
        <pre className="overflow-x-auto rounded-xl bg-slate-100 p-3 text-xs dark:bg-navy-950">NEXT_PUBLIC_SUPABASE_URL{"\n"}NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</pre>
        <p>Na Vercel: Settings → Environment Variables. No computador: arquivo <code>.env.local</code>. O passo a passo está no LEIA-ME.</p>
      </div>
    </div>
  );
}
