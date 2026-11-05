"use client";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/finance/money";

export function cx(...c: (string | false | null | undefined | 0)[]): string {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";

// primária = verde-limão com texto preto (assinatura da marca); demais neutras
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-400 font-semibold text-navy-950 shadow-[var(--shadow-glow)] hover:bg-brand-300 hover:shadow-[0_12px_34px_-10px_rgb(183_240_0/0.7)]",
  secondary:
    "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 dark:bg-white/[0.04] dark:text-slate-100 dark:ring-white/10 dark:hover:bg-white/[0.08] dark:hover:ring-white/20",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white",
  danger: "bg-rose-500 font-semibold text-white hover:bg-rose-600",
  success: "bg-brand-400 font-semibold text-navy-950 hover:bg-brand-300",
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
        "inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
        size === "sm" ? "h-9 px-3.5 text-sm" : "h-11 px-5 text-sm",
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
        "inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white",
        "focus-visible:outline-2 focus-visible:outline-brand-400",
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
        "rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-slate-200/80 sm:p-5 dark:bg-navy-900 dark:shadow-[var(--shadow-card-dark)] dark:ring-white/[0.06]",
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
    <div className="mb-4 flex items-start justify-between gap-2">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">{children}</h2>
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
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-slate-600 dark:text-slate-400">{label}</span>
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
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-400/20 disabled:opacity-60 dark:border-white/10 dark:bg-navy-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-white/20 dark:focus:border-brand-400 dark:[color-scheme:dark]";

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
      className={cx(inputBase, "money h-11 text-base font-semibold", className)}
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
    slate: "bg-slate-100 text-slate-700 dark:bg-white/[0.06] dark:text-slate-300",
    green: "bg-brand-50 text-brand-700 ring-1 ring-brand-200/60 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20",
    red: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/60 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
    amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/60 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
    blue: "bg-slate-100 text-slate-800 dark:bg-white/[0.08] dark:text-slate-200",
    violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-200/60 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone])}>{children}</span>;
}

export function Progress({ value, tone }: { value: number; tone?: "green" | "amber" | "red" | "navy" }) {
  const t = tone ?? (value > 100 ? "red" : value >= 80 ? "amber" : "green");
  const colors = { green: "bg-brand-500 dark:bg-brand-400", amber: "bg-amber-400", red: "bg-rose-500", navy: "bg-slate-800 dark:bg-slate-300" };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-[width] duration-700 ease-out", colors[t])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex animate-in flex-col items-center px-4 py-10 text-center">
      {icon && <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-200/70 dark:bg-brand-400/10 dark:text-brand-400 dark:ring-brand-400/20">{icon}</div>}
      <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-2xl bg-slate-200/70 dark:bg-white/[0.05]", className)} />;
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
    <div role="tablist" className={cx("inline-flex max-w-full overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none] ring-1 ring-slate-200/70 dark:bg-white/[0.04] dark:ring-white/[0.06]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 sm:text-sm",
            value === o.value
              ? "bg-navy-950 text-brand-400 shadow-sm dark:bg-brand-400 dark:text-navy-950"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
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
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/60 dark:bg-white/[0.03] dark:ring-white/[0.06]">
      <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400", checked ? "bg-brand-400" : "bg-slate-300 dark:bg-white/15")}
      >
        <span className={cx("absolute top-0.5 size-5 rounded-full shadow transition-all duration-200", checked ? "left-[22px] bg-navy-950" : "left-0.5 bg-white")} />
      </button>
    </label>
  );
}

export function Money({ value, className, signed, colored }: { value: number; className?: string; signed?: boolean; colored?: boolean }) {
  const text = signed && value !== 0 ? `${value > 0 ? "+" : "−"} ${formatMoney(Math.abs(value))}` : formatMoney(value);
  return (
    <span
      className={cx(
        "money whitespace-nowrap",
        colored && value > 0 && "text-brand-600 dark:text-brand-400",
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

// cores para contas, cartões e categorias: harmonizadas com o preto e o limão (as já escolhidas continuam valendo)
export const COLORS = [
  "#b7f000", "#7fa800", "#45936f", "#2fb5a3", "#3b9edb", "#6d7cf2",
  "#a77bf3", "#e86fb4", "#f4405c", "#f59e3b", "#e7c84a", "#858b84",
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
          className={cx("size-8 rounded-full ring-offset-2 transition hover:scale-110 dark:ring-offset-navy-900", value === c && "ring-2 ring-navy-950 dark:ring-brand-400")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-brand-500 dark:text-brand-400", className)} />;
}
