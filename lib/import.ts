// Importação de movimentações de CSV ou Excel (extratos do banco, planilhas próprias).
import type { Category } from "./types";
import { parseDateBR, toISO, type ISODate } from "./finance/dates";
import { parseMoney } from "./finance/money";

export type Cell = string | number | Date | null;
export interface Sheet {
  headers: string[];
  rows: Cell[][];
}

export interface Mapping {
  date: number;
  description: number;
  amount: number;
  category: number; // -1 = nenhuma
  type: number; // -1 = pelo sinal do valor
}

export interface ParsedRow {
  index: number;
  date: ISODate | null;
  description: string;
  amount: number | null; // centavos, positivo
  kind: "receita" | "despesa";
  category_id: string | null;
  categoryName: string;
  error: string | null;
}

export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Adivinha quais colunas são data, descrição, valor, categoria e tipo pelo cabeçalho. */
export function guessMapping(headers: string[]): Mapping {
  const h = headers.map(norm);
  const find = (re: RegExp) => h.findIndex((x) => re.test(x));
  return {
    date: Math.max(0, find(/^data|date|dt\b|vencimento/)),
    description: Math.max(0, find(/descri|histor|lancamento|estabelecimento|title|memo|nome/)),
    amount: Math.max(0, find(/valor|value|amount|quantia|montante|r\$/)),
    category: find(/categ/),
    type: find(/^tipo|type|natureza|^d\/c$|credito.?debito/),
  };
}

function cellText(c: Cell): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return toISO(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate());
  return String(c).trim();
}

function cellDate(c: Cell): ISODate | null {
  if (c instanceof Date) return toISO(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate());
  if (typeof c === "number" && c > 20000 && c < 80000) {
    // número de série de data do Excel
    const d = new Date(Date.UTC(1899, 11, 30) + c * 86400000);
    return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return parseDateBR(cellText(c));
}

function cellMoney(c: Cell): number | null {
  if (typeof c === "number") return Math.round(c * 100);
  return parseMoney(cellText(c));
}

export function parseRows(sheet: Sheet, m: Mapping, categories: Category[]): ParsedRow[] {
  const byName = new Map(categories.map((c) => [`${c.kind}:${norm(c.name)}`, c]));
  return sheet.rows.map((r, index) => {
    const date = cellDate(r[m.date] ?? null);
    const description = cellText(r[m.description] ?? null).slice(0, 120);
    const raw = cellMoney(r[m.amount] ?? null);
    let kind: "receita" | "despesa" = raw !== null && raw > 0 ? "receita" : "despesa";
    if (m.type >= 0) {
      const t = norm(cellText(r[m.type] ?? null));
      if (/^(receita|entrada|credito|c|recebimento|income)/.test(t)) kind = "receita";
      else if (/^(despesa|saida|debito|d|pagamento|expense)/.test(t)) kind = "despesa";
    }
    const categoryName = m.category >= 0 ? cellText(r[m.category] ?? null) : "";
    const cat = categoryName ? byName.get(`${kind}:${norm(categoryName)}`) ?? null : null;
    const amount = raw === null ? null : Math.abs(raw);
    let error: string | null = null;
    if (!date) error = "Data inválida";
    else if (!description) error = "Sem descrição";
    else if (!amount) error = "Valor inválido";
    return { index, date, description, amount, kind, category_id: cat?.id ?? null, categoryName, error };
  });
}

export async function readFile(file: File): Promise<Sheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("A planilha está vazia.");
    const all: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[]).slice(1).map((v): Cell => {
        if (v === null || v === undefined) return null;
        if (v instanceof Date || typeof v === "number" || typeof v === "string") return v;
        if (typeof v === "object") {
          const o = v as { result?: unknown; text?: string; richText?: { text: string }[] };
          if (o.result !== undefined) return o.result as Cell;
          if (o.richText) return o.richText.map((t) => t.text).join("");
          if (o.text) return o.text;
        }
        return String(v);
      });
      all.push(vals);
    });
    const [headers = [], ...rows] = all;
    return { headers: headers.map((h) => cellText(h)), rows: rows.filter((r) => r.some((c) => cellText(c))) };
  }
  if (name.endsWith(".xls")) throw new Error("Arquivos .xls antigos não são aceitos. Abra no Excel e salve como .xlsx ou .csv.");
  const Papa = (await import("papaparse")).default;
  let text = await file.text();
  if (text.includes("�")) {
    // extratos de bancos brasileiros às vezes vêm em Latin-1
    text = new TextDecoder("windows-1252").decode(await file.arrayBuffer());
  }
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy", delimiter: "" });
  const [headers = [], ...rows] = res.data;
  return { headers: headers.map((h) => h.trim()), rows: rows.map((r) => r.map((c) => (c ?? "").trim())) };
}
