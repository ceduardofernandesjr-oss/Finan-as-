// Datas como texto "AAAA-MM-DD" (sem fuso horário), para não haver deslocamento de um dia.

export type ISODate = string;

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parts(date: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

export function isValidISO(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const { y, m, d } = parts(date);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Soma meses mantendo o dia; se o mês não tiver o dia (ex.: 31), usa o último dia. */
export function addMonths(date: ISODate, months: number, keepDay?: number): ISODate {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(keepDay ?? d, daysInMonth(ny, nm));
  return toISO(ny, nm, day);
}

export function addDays(date: ISODate, days: number): ISODate {
  const { y, m, d } = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000);
}

/** "AAAA-MM" */
export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function monthStart(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: ISODate): ISODate {
  const { y, m } = parts(date);
  return toISO(y, m, daysInMonth(y, m));
}

export function setDay(date: ISODate, day: number): ISODate {
  const { y, m } = parts(date);
  return toISO(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Dia da semana: 0 = domingo */
export function weekday(date: ISODate): number {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatBR(date: ISODate | null | undefined): string {
  if (!date) return "—";
  const { y, m, d } = parts(date);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** "DD/MM/AAAA" ou "AAAA-MM-DD" (ou "DD/MM/AA") -> ISO; null se inválida */
export function parseDateBR(input: string): ISODate | null {
  const s = input.trim();
  let iso: string | null = null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    iso = toISO(year, Number(m[2]), Number(m[1]));
  } else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    iso = toISO(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return iso && isValidISO(iso) ? iso : null;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_FULL = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-11" -> "nov/26" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`;
}

/** "2026-11" -> "Novembro de 2026" */
export function monthLabelFull(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const name = MONTHS_FULL[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
}

/** Lista de chaves de mês entre duas datas, inclusive. */
export function monthRange(from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  let cur = monthStart(from);
  const end = monthKey(to);
  while (monthKey(cur) <= end) {
    out.push(monthKey(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}

export type Period = "semana" | "mes" | "trimestre" | "ano";

export const PERIOD_LABEL: Record<Period, string> = {
  semana: "Semana",
  mes: "Mês",
  trimestre: "Trimestre",
  ano: "Ano",
};

/** Intervalo do período que contém a data de referência, deslocado por `offset` períodos. */
export function periodRange(period: Period, ref: ISODate, offset = 0): { from: ISODate; to: ISODate } {
  const { y, m } = parts(ref);
  switch (period) {
    case "semana": {
      const start = addDays(ref, -((weekday(ref) + 6) % 7) + offset * 7); // segunda-feira
      return { from: start, to: addDays(start, 6) };
    }
    case "mes": {
      const start = addMonths(toISO(y, m, 1), offset);
      return { from: start, to: monthEnd(start) };
    }
    case "trimestre": {
      const qStart = toISO(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
      const start = addMonths(qStart, offset * 3);
      return { from: start, to: monthEnd(addMonths(start, 2)) };
    }
    case "ano": {
      const start = toISO(y + offset, 1, 1);
      return { from: start, to: toISO(y + offset, 12, 31) };
    }
  }
}

export function periodTitle(period: Period, range: { from: ISODate; to: ISODate }): string {
  switch (period) {
    case "semana":
      return `${formatBR(range.from).slice(0, 5)} a ${formatBR(range.to)}`;
    case "mes":
      return monthLabelFull(monthKey(range.from));
    case "trimestre":
      return `${Math.floor((parts(range.from).m - 1) / 3) + 1}º trimestre de ${parts(range.from).y}`;
    case "ano":
      return String(parts(range.from).y);
  }
}

export function inRange(date: ISODate | null | undefined, from: ISODate, to: ISODate): boolean {
  return !!date && date >= from && date <= to;
}
