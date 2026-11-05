export const STATUS_TONE = { aberta: "blue", fechada: "amber", paga: "green", vencida: "red", futura: "slate" } as const;
export const STATUS_LABEL = { aberta: "Aberta", fechada: "Fechada", paga: "Paga", vencida: "Vencida", futura: "Futura" } as const;

export function CardVisual({ name, brand, color, institution }: { name: string; brand: string; color: string; institution: string }) {
  return (
    <div className="relative aspect-[1.7] w-full overflow-hidden rounded-[1.25rem] p-4 text-white shadow-[0_18px_40px_-18px_rgb(0_0_0/0.8)] ring-1 ring-white/10" style={{ background: `linear-gradient(135deg, ${color} -20%, #111411 55%, #080a08)` }}>
      <div className="absolute -right-10 -top-12 size-40 rounded-full opacity-40 blur-2xl" style={{ background: color }} />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] bg-[size:14px_14px] [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
      <p className="text-xs opacity-80">{institution || "Cartão de crédito"}</p>
      <p className="mt-1 text-lg font-semibold">{name}</p>
      <div className="absolute bottom-4 left-4 h-6 w-9 rounded-md bg-gradient-to-br from-amber-100 to-amber-300/80 ring-1 ring-black/10" />
      <p className="absolute bottom-4 right-4 text-sm font-semibold italic opacity-90">{brand}</p>
    </div>
  );
}

