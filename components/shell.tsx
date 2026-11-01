"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, BarChart3, Brain, CalendarDays, Calculator, CreditCard,
  HandCoins, Landmark, LayoutDashboard, LogOut, Menu, Moon, Plus, Receipt, Settings, Sun, Target, Wallet, X,
} from "lucide-react";
import { cx, IconButton } from "./ui";
import { useForms } from "./forms/provider";
import { supabase } from "@/lib/supabase/client";
import { useFinance } from "@/lib/store";

export const NAV: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/receitas", label: "Receitas", icon: ArrowUpCircle },
  { href: "/despesas", label: "Despesas", icon: ArrowDownCircle },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/a-pagar", label: "Contas a pagar", icon: Receipt },
  { href: "/a-receber", label: "Contas a receber", icon: HandCoins },
  { href: "/dividas", label: "Dívidas", icon: Landmark },
  { href: "/planejamento", label: "Planejamento", icon: Target },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/inteligencia", label: "Inteligência financeira", icon: Brain },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/simulador", label: "Simulador", icon: Calculator },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

const MOBILE = ["/", "/despesas", "/cartoes"];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("tema", next ? "escuro" : "claro");
    } catch {}
  };
  return { dark, toggle };
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-navy-700 text-white shadow-sm dark:bg-navy-500">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17l5-5 4 3 7-8" />
          <path d="M15 7h5v5" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Finanças</span>
    </Link>
  );
}

function QuickAddMenu({ onClose }: { onClose: () => void }) {
  const forms = useForms();
  const items = [
    { label: "Receita", icon: ArrowUpCircle, color: "text-emerald-600", run: () => forms.openTx({ kind: "receita" }) },
    { label: "Despesa", icon: ArrowDownCircle, color: "text-rose-600", run: () => forms.openTx({ kind: "despesa" }) },
    { label: "Compra no cartão", icon: CreditCard, color: "text-violet-600", run: () => forms.openPurchase({}) },
    { label: "Transferência", icon: ArrowLeftRight, color: "text-navy-600", run: () => forms.openTransfer() },
  ];
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-navy-950/30" />
      <div
        className="absolute bottom-24 left-1/2 w-[min(92vw,22rem)] -translate-x-1/2 animate-sheet rounded-2xl bg-white p-2 shadow-2xl lg:bottom-24 lg:left-auto lg:right-8 lg:translate-x-0 dark:bg-navy-900"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((i) => (
          <button
            key={i.label}
            onClick={() => {
              onClose();
              i.run();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-slate-50 dark:hover:bg-navy-800"
          >
            <i.icon className={cx("size-5", i.color)} />
            {i.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const [more, setMore] = useState(false);
  const [quick, setQuick] = useState(false);
  const { error, reload } = useFinance();

  useEffect(() => setMore(false), [path]);

  const signOut = async () => {
    await supabase().auth.signOut();
    router.replace("/entrar");
    router.refresh();
  };

  return (
    <div className="min-h-dvh lg:flex">
      {/* barra lateral (computador) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 lg:flex dark:border-navy-800 dark:bg-navy-900">
        <div className="px-2 pb-4">
          <Logo />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                isActive(path, n.href)
                  ? "bg-navy-50 font-semibold text-navy-800 dark:bg-navy-800 dark:text-white"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-navy-800/60 dark:hover:text-white",
              )}
            >
              <n.icon className="size-[18px]" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-3 dark:border-navy-800">
          <IconButton label={dark ? "Modo claro" : "Modo escuro"} onClick={toggle}>
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </IconButton>
          <button onClick={signOut} className="ml-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-navy-800">
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* topo (celular) */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur lg:hidden dark:border-navy-800 dark:bg-navy-950/85">
          <Logo />
          <IconButton label={dark ? "Modo claro" : "Modo escuro"} onClick={toggle}>
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </IconButton>
        </header>

        {error && (
          <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 lg:mx-8 dark:bg-rose-500/10 dark:text-rose-200">
            <span>Não foi possível carregar seus dados: {error}</span>
            <button className="font-semibold underline" onClick={reload}>
              Tentar de novo
            </button>
          </div>
        )}

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* botão de ação rápida */}
      <button
        onClick={() => setQuick((q) => !q)}
        aria-label="Adicionar"
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-navy-700 text-white shadow-xl shadow-navy-900/30 transition hover:bg-navy-800 active:scale-95 lg:bottom-8 lg:left-auto lg:right-8 lg:translate-x-0 dark:bg-navy-500"
      >
        {quick ? <X className="size-6" /> : <Plus className="size-7" />}
      </button>
      {quick && <QuickAddMenu onClose={() => setQuick(false)} />}

      {/* navegação inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-navy-800 dark:bg-navy-900/95">
        {MOBILE.slice(0, 2).map((h) => (
          <MobileItem key={h} href={h} path={path} />
        ))}
        <span />
        <MobileItem href={MOBILE[2]} path={path} />
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-slate-500 dark:text-slate-400">
          <Menu className="size-5" />
          Mais
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-0 bg-navy-950/40" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] animate-sheet overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:bg-navy-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 dark:bg-navy-700" />
            <div className="grid grid-cols-3 gap-2">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx(
                    "flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs",
                    isActive(path, n.href) ? "bg-navy-50 font-semibold text-navy-800 dark:bg-navy-800 dark:text-white" : "text-slate-600 dark:text-slate-300",
                  )}
                >
                  <n.icon className="size-5" />
                  {n.label}
                </Link>
              ))}
              <button onClick={signOut} className="flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs text-rose-600">
                <LogOut className="size-5" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileItem({ href, path }: { href: string; path: string }) {
  const n = NAV.find((x) => x.href === href)!;
  const active = isActive(path, href);
  return (
    <Link
      href={href}
      className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "font-semibold text-navy-700 dark:text-white" : "text-slate-500 dark:text-slate-400")}
    >
      <n.icon className="size-5" />
      {n.label}
    </Link>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
