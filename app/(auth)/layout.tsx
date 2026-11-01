export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-white">
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17l5-5 4 3 7-8" />
              <path d="M15 7h5v5" />
            </svg>
          </span>
          <p className="text-lg font-semibold">Finanças</p>
          <p className="text-sm text-navy-200">Seu dinheiro organizado, num só lugar.</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-2xl dark:bg-navy-900">{children}</div>
      </div>
    </div>
  );
}
