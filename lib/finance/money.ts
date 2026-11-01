// Dinheiro em centavos inteiros: nunca usamos float para somar valores.

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL_COMPACT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** 123456 -> "R$ 1.234,56" */
export function formatMoney(cents: number): string {
  return BRL.format(cents / 100).replace(/ /g, " ");
}

/** Valores grandes de forma curta, para eixos de gráfico: "R$ 12,3 mil" */
export function formatMoneyCompact(cents: number): string {
  return BRL_COMPACT.format(cents / 100).replace(/ /g, " ");
}

/** Sinal explícito: "+ R$ 10,00" / "− R$ 10,00" */
export function formatSigned(cents: number): string {
  if (cents === 0) return formatMoney(0);
  return `${cents > 0 ? "+" : "−"} ${formatMoney(Math.abs(cents))}`;
}

/**
 * Converte texto digitado em centavos. Aceita "1.234,56", "1234,5", "1234.56", "R$ 10", "-50,00".
 * Retorna null se não for um número.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  let s = input.trim().replace(/R\$|\s| /g, "");
  if (!s) return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    // o separador que aparece por último é o decimal
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1) {
    // "1.234" (milhar) vs "12.5" (decimal): com 3 dígitos após um único ponto, tratamos como milhar
    const parts = s.split(".");
    normalized = parts.length > 2 || parts[parts.length - 1].length === 3 ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [int, dec = ""] = normalized.split(".");
  const cents = Number(int) * 100 + Number((dec + "00").slice(0, 2)) + (Number(dec[2] ?? 0) >= 5 ? 1 : 0);
  return negative ? -cents : cents;
}

/** Divide um total em n partes que somam exatamente o total; os centavos que sobram vão nas primeiras. */
export function splitEvenly(total: number, n: number): number[] {
  if (n < 1) throw new Error("n deve ser >= 1");
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

export function sum(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return (part / whole) * 100;
}

export function formatPct(value: number, digits = 0): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}
