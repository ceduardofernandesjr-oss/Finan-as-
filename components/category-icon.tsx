"use client";
// Ícone específico para cada categoria financeira (Lucide, mesmo traço em todo o app).
// Reconhece as categorias padrão e nomes comuns criados pela pessoa; o resto usa um ícone genérico.
import {
  Baby, Banknote, BookOpen, Briefcase, Car, CircleDollarSign, Coins, CreditCard, Dog, Dumbbell, Fuel, Gift, GraduationCap,
  HandCoins, HeartPulse, Home, Landmark, Laptop, Lightbulb, type LucideIcon, Pill, PiggyBank, Plane, Receipt, Repeat,
  Shirt, ShoppingBag, ShoppingCart, Sparkles, Store, Ticket, TrendingUp, Utensils, Wallet, Wifi, Wrench, Zap,
} from "lucide-react";
import { cx } from "./ui";
import type { Category } from "@/lib/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REGRAS: [RegExp, LucideIcon][] = [
  [/salario|holerite|pro.?labore/, Briefcase],
  [/servic|freela|consultoria/, Laptop],
  [/venda/, Store],
  [/extra|comiss|bonus|plantao/, Sparkles],
  [/rendiment|invest|juros|dividend|aplicac/, TrendingUp],
  [/reembolso|outras receitas|receita/, HandCoins],
  [/aluguel|moradia|casa|condominio/, Home],
  [/mercado|supermercado|feira/, ShoppingCart],
  [/restaurante|lanche|ifood|delivery|refeic|aliment|comida/, Utensils],
  [/combust|gasolina|posto/, Fuel],
  [/transporte|uber|onibus|carro|veiculo|estacionamento/, Car],
  [/luz|energia/, Lightbulb],
  [/internet|telefone|celular/, Wifi],
  [/contas domesticas|agua|gas|domestic/, Zap],
  [/farmacia|remedio/, Pill],
  [/academia|esporte/, Dumbbell],
  [/saude|medic|plano de saude|dentista/, HeartPulse],
  [/educac|curso|faculdade|escola/, GraduationCap],
  [/livro/, BookOpen],
  [/lazer|cinema|show|entretenimento/, Ticket],
  [/viage/, Plane],
  [/assinatura|streaming/, Repeat],
  [/imposto|taxa|tribut/, Landmark],
  [/roupa|vestuario/, Shirt],
  [/presente/, Gift],
  [/compras|shopping/, ShoppingBag],
  [/emprestimo|financiamento|divida/, CreditCard],
  [/pet|animal|veterin/, Dog],
  [/filho|crianca|bebe/, Baby],
  [/manutenc|reforma|conserto/, Wrench],
  [/poupanca|reserva|meta/, PiggyBank],
  [/tarifa|banco/, Banknote],
  [/conta/, Receipt],
];

export function iconeCategoria(nome: string | undefined | null, kind?: "receita" | "despesa"): LucideIcon {
  const n = norm(nome ?? "");
  for (const [re, Icone] of REGRAS) if (re.test(n)) return Icone;
  return kind === "receita" ? Coins : kind === "despesa" ? Wallet : CircleDollarSign;
}

/** Selo de categoria: ícone com fundo na cor da categoria (suave), em estilo duotone. */
export function CategoryIcon({ category, name, kind, className, size = "md" }: { category?: Category | null; name?: string; kind?: "receita" | "despesa"; className?: string; size?: "sm" | "md" }) {
  const Icone = iconeCategoria(category?.name ?? name, category?.kind ?? kind);
  const cor = category?.color ?? "#858b84";
  return (
    <span
      className={cx(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10",
        // no escuro o ícone clareia para não sumir no preto, mesmo com cores de categoria escuras
        "text-[color:color-mix(in_srgb,var(--cat)_85%,black)] dark:text-[color:color-mix(in_srgb,var(--cat)_60%,white)]",
        size === "sm" ? "size-8" : "size-10",
        className,
      )}
      style={{ "--cat": cor } as React.CSSProperties}
      aria-hidden
    >
      <span className="absolute inset-0 opacity-[0.14] dark:opacity-[0.2]" style={{ background: cor }} />
      <Icone className={cx("relative", size === "sm" ? "size-4" : "size-[18px]")} strokeWidth={2.1} />
    </span>
  );
}
