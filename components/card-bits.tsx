export const STATUS_TONE = { aberta: "blue", fechada: "amber", paga: "green", vencida: "red", futura: "slate" } as const;
export const STATUS_LABEL = { aberta: "Aberta", fechada: "Fechada", paga: "Paga", vencida: "Vencida", futura: "Futura" } as const;

export function CardVisual({ name, brand, color, institution }: { name: string; brand: string; color: string; institution: string }) {
  return (
    <div className="relative aspect-[1.7] w-full overflow-hidden rounded-2xl p-4 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${color}, #0e1838)` }}>
      <div className="absolute -right-8 -top-8 size-32 rounded-full bg-white/10" />
      <div className="absolute -bottom-10 -left-6 size-28 rounded-full bg-white/5" />
      <p className="text-xs opacity-80">{institution || "Cartão de crédito"}</p>
      <p className="mt-1 text-lg font-semibold">{name}</p>
      <div className="absolute bottom-4 left-4 h-6 w-9 rounded-md bg-amber-200/80" />
      <p className="absolute bottom-4 right-4 text-sm font-semibold italic opacity-90">{brand}</p>
    </div>
  );
}

