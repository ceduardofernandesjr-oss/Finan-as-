"use client";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/finance/money";

export function cx(...c: (string | false | null | undefined | 0)[]): string {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-navy-700 text-white hover:bg-navy-800 dark:bg-navy-500 dark:hover:bg-navy-400",
  secondary:
    "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-navy-900 dark:text-slate-200 dark:ring-navy-700 dark:hover:bg-navy-800",
  ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-500",
        size === "sm" ? "h-9 px-3 text-sm" : "h-11 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-navy-800 dark:hover:text-white",
        "focus-visible:outline-2 focus-visible:outline-navy-500",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5 dark:bg-navy-900 dark:ring-navy-800",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, action, sub }: { children: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{children}</h2>
        {sub && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20 disabled:opacity-60 dark:border-navy-700 dark:bg-navy-950 dark:text-slate-100";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(inputBase, "h-11", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputBase, "h-11 pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputBase, "min-h-20 py-2.5", className)} {...rest} />;
}

/**
 * Campo de dinheiro: a pessoa digita só números e o valor vai se formando da direita
 * para a esquerda (como no app do banco). Trabalha em centavos.
 */
export function MoneyInput({
  value,
  onChange,
  autoFocus,
  id,
  className,
  allowZero,
}: {
  value: number | null;
  onChange: (cents: number) => void;
  autoFocus?: boolean;
  id?: string;
  className?: string;
  allowZero?: boolean;
}) {
  const [text, setText] = useState(value ? formatMoney(value) : "");
  useEffect(() => {
    setText(value || allowZero ? formatMoney(value ?? 0) : "");
  }, [value, allowZero]);
  return (
    <input
      id={id}
      inputMode="numeric"
      autoFocus={autoFocus}
      placeholder="R$ 0,00"
      className={cx(inputBase, "h-11 tabular text-base font-semibold", className)}
      value={text}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
        const cents = digits ? Number(digits) : 0;
        setText(cents || allowZero ? formatMoney(cents) : "");
        onChange(cents);
      }}
    />
  );
}

export function Badge({ tone = "slate", children }: { tone?: "slate" | "green" | "red" | "amber" | "blue" | "violet"; children: ReactNode }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 dark:bg-navy-800 dark:text-slate-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    red: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    blue: "bg-navy-50 text-navy-700 dark:bg-navy-500/20 dark:text-navy-200",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone])}>{children}</span>;
}

export function Progress({ value, tone }: { value: number; tone?: "green" | "amber" | "red" | "navy" }) {
  const t = tone ?? (value > 100 ? "red" : value >= 80 ? "amber" : "green");
  const colors = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500", navy: "bg-navy-500" };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-navy-800" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-all", colors[t])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-600 dark:bg-navy-800 dark:text-navy-200">{icon}</div>}
      <p className="font-medium text-slate-800 dark:text-slate-100">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-slate-200/70 dark:bg-navy-800", className)} />;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cx("inline-flex rounded-xl bg-slate-100 p-1 dark:bg-navy-900", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition sm:text-sm",
            value === o.value
              ? "bg-white text-navy-800 shadow-sm dark:bg-navy-700 dark:text-white"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-navy-950">
      <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-navy-600" : "bg-slate-300 dark:bg-navy-700")}
      >
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Money({ value, className, signed, colored }: { value: number; className?: string; signed?: boolean; colored?: boolean }) {
  const text = signed && value !== 0 ? `${value > 0 ? "+" : "−"} ${formatMoney(Math.abs(value))}` : formatMoney(value);
  return (
    <span
      className={cx(
        "tabular whitespace-nowrap",
        colored && value > 0 && "text-emerald-600 dark:text-emerald-400",
        colored && value < 0 && "text-rose-600 dark:text-rose-400",
        className,
      )}
    >
      {text}
    </span>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

export const COLORS = [
  "#1e3a8a", "#2563eb", "#0891b2", "#059669", "#16a34a", "#ca8a04",
  "#ea580c", "#dc2626", "#db2777", "#9333ea", "#7c3aed", "#475569",
];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Cor ${c}`}
          onClick={() => onChange(c)}
          className={cx("size-8 rounded-full ring-offset-2 transition dark:ring-offset-navy-900", value === c && "ring-2 ring-navy-500")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-navy-500", className)} />;
}
