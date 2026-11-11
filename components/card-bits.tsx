export const STATUS_TONE = { aberta: "blue", fechada: "amber", paga: "green", vencida: "red", futura: "slate" } as const;
export const STATUS_LABEL = { aberta: "Aberta", fechada: "Fechada", paga: "Paga", vencida: "Vencida", futura: "Futura" } as const;

export function CardVisual({ name, brand, color, institution }: { name: string; brand: string; color: string; institution: string }) {
  // cartão elegante: base grafite com um toque da cor do cartão, sem brilhos exagerados
  return (
    <div
      className="relative aspect-[1.7] w-full overflow-hidden rounded-[20px] p-4 text-slate-50 shadow-[0_16px_32px_-18px_rgb(0_0_0/0.85)] ring-1 ring-white/[0.08] sm:p-5"
      style={{ background: `linear-gradient(140deg, ${color}38 0%, #1c211b 42%, #101310 100%)` }}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{institution || "Cartão de crédito"}</p>
          <p className="mt-1 truncate text-[17px] font-semibold">{name}</p>
        </div>
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      </div>
      <div aria-hidden className="absolute bottom-4 left-4 h-7 w-10 rounded-md bg-gradient-to-br from-[#e9e2c8] to-[#b9ad86] opacity-90 ring-1 ring-black/20 sm:bottom-5 sm:left-5" />
      <p className="absolute bottom-4 right-4 text-sm font-semibold italic tracking-wide text-slate-200 sm:bottom-5 sm:right-5">{brand}</p>
    </div>
  );
}
