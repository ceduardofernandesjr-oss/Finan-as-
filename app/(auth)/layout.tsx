export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-navy-950 p-4">
      {/* brilho verde-limão de fundo */}
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-brand-400/20 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-40 size-[30rem] rounded-full bg-brand-400/10 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.025)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="relative w-full max-w-sm animate-in">
        <div className="mb-7 flex flex-col items-center text-white">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-400 text-navy-950 shadow-[0_16px_48px_-12px_rgb(183_240_0/0.7)]">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 17l5-5 4 3 7-8" />
              <path d="M15 7h5v5" />
            </svg>
          </span>
          <p className="text-2xl font-semibold tracking-tight">Finanças<span className="text-brand-400">.</span></p>
          <p className="mt-1 text-sm text-slate-400">Seu dinheiro organizado, num só lugar.</p>
        </div>
        <div className="rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-black/5 sm:p-7 dark:bg-navy-900/90 dark:ring-line dark:backdrop-blur-xl">{children}</div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Conexão protegida · seus dados são só seus
        </p>
      </div>
    </div>
  );
}
