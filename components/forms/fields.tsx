"use client";
import { useFinance } from "@/lib/store";
import type { CategoryKind } from "@/lib/types";
import { Select } from "../ui";
import { z } from "zod";

export function CategorySelect({
  kind,
  value,
  onChange,
  rootsOnly,
  allowEmpty = true,
  emptyLabel = "Sem categoria",
}: {
  kind: CategoryKind;
  value: string | null;
  onChange: (id: string | null) => void;
  rootsOnly?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const { data } = useFinance();
  const roots = data.categories.filter((c) => c.kind === kind && !c.parent_id);
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {roots.map((r) => {
        const subs = rootsOnly ? [] : data.categories.filter((c) => c.parent_id === r.id);
        return subs.length ? (
          <optgroup key={r.id} label={r.name}>
            <option value={r.id}>{r.name}</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {r.name} › {s.name}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        );
      })}
    </Select>
  );
}

export function AccountSelect({
  value,
  onChange,
  exclude,
  placeholder = "Escolha a conta",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  exclude?: string | null;
  placeholder?: string;
}) {
  const { data } = useFinance();
  const list = data.accounts.filter((a) => (!a.archived || a.id === value) && a.id !== exclude);
  return (
    <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </Select>
  );
}

/** Valida com zod e devolve { campo: mensagem } */
export function validate<T>(schema: z.ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; errors: Record<string, string> } {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  const errors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const k = String(issue.path[0] ?? "_");
    if (!errors[k]) errors[k] = issue.message;
  }
  return { ok: false, errors };
}

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data");
export const zMoney = z.number({ message: "Informe o valor" }).int().positive("Informe um valor maior que zero").max(99_999_999_999, "Valor muito alto");
export const zText = (label: string, max = 120) =>
  z.string().trim().min(1, `Informe ${label}`).max(max, `Máximo de ${max} caracteres`);
