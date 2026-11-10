"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, BarChart3, Brain, CalendarDays, Calculator, CreditCard,
  HandCoins, Landmark, LayoutDashboard, LogOut, Menu, MessageCircle, Moon, PlugZap, Plus, Receipt, Settings, Sun, Target, Wallet, X,
} from "lucide-react";
import { cx, IconButton } from "./ui";
import { useForms } from "./forms/provider";
import { supabase } from "@/lib/supabase/client";
import { useFinance } from "@/lib/store";

export const NAV: { href: string; label: string; icon: typeof LayoutDashboard }[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/assistente", label: "Assistente", icon: MessageCircle },
  { href: "/receitas", label: "Receitas", icon: ArrowUpCircle },
  { href: "/despesas", label: "Despesas", icon: ArrowDownCircle },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/conexoes", label: "Conexões bancárias", icon: PlugZap },
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

// Navegação organizada por contexto (mesmas telas de sempre, agrupadas)
export const GRUPOS: { titulo: string; itens: string[] }[] = [
  { titulo: "Visão geral", itens: ["/", "/assistente"] },
  { titulo: "Movimentações", itens: ["/receitas", "/despesas", "/a-pagar", "/a-receber", "/calendario"] },
  { titulo: "Contas e cartões", itens: ["/contas", "/cartoes", "/dividas", "/conexoes"] },
  { titulo: "Planejamento", itens: ["/planejamento", "/simulador"] },
  { titulo: "Análises", itens: ["/relatorios", "/inteligencia"] },
];
const navItem = (href: string) => NAV.find((n) => n.href === href)!;

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
      <span className="flex size-9 items-center justify-center rounded-xl bg-brand-400 text-navy-950 shadow-[var(--shadow-glow)]">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 17l5-5 4 3 7-8" />
          <path d="M15 7h5v5" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">
        Finanças<span className="text-brand-500 dark:text-brand-400">.</span>
      </span>
    </Link>
  );
}

function QuickAddMenu({ onClose }: { onClose: () => void }) {
  const forms = useForms();
  const items = [
    { label: "Receita", sub: "Salário, vendas, rendimentos", icon: ArrowUpCircle, tone: "bg-brand-400/15 text-brand-600 dark:text-brand-400", run: () => forms.openTx({ kind: "receita" }) },
    { label: "Despesa", sub: "Pix, débito, boleto, dinheiro", icon: ArrowDownCircle, tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400", run: () => forms.openTx({ kind: "despesa" }) },
    { label: "Compra no cartão", sub: "À vista ou parcelada", icon: CreditCard, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300", run: () => forms.openPurchase({}) },
    { label: "Transferência", sub: "Entre as suas contas", icon: ArrowLeftRight, tone: "bg-slate-500/10 text-slate-700 dark:text-slate-200", run: () => forms.openTransfer() },
  ];
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]" />
      <div
        role="menu"
        className="absolute bottom-24 left-1/2 w-[min(92vw,22rem)] -translate-x-1/2 animate-sheet rounded-3xl bg-white p-2 shadow-2xl ring-1 ring-slate-200 lg:bottom-28 lg:left-auto lg:right-8 lg:translate-x-0 dark:bg-navy-900 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Novo lançamento</p>
        {items.map((i) => (
          <button
            key={i.label}
            role="menuitem"
            onClick={() => {
              onClose();
              i.run();
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-slate-50 active:scale-[0.99] dark:hover:bg-white/[0.05]"
          >
            <span className={cx("flex size-10 items-center justify-center rounded-xl", i.tone)}>
              <i.icon className="size-5" strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-sm font-semibold">{i.label}</span>
              <span className="block text-xs text-slate-500">{i.sub}</span>
            </span>
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
    // apaga as telas guardadas no aparelho (abrem rápido, mas não depois de sair)
    try { if ("caches" in window) await caches.delete("financas-paginas-v1"); } catch { /* sem cache */ }
    router.replace("/entrar");
    router.refresh();
  };

  return (
    <div className="min-h-dvh lg:flex">
      {/* barra lateral (computador) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white/80 px-3 py-5 backdrop-blur lg:flex dark:border-white/[0.06] dark:bg-navy-950/80">
        <div className="px-3 pb-5">
          <Logo />
        </div>
        <nav className="-mx-1 flex-1 space-y-5 overflow-y-auto px-1" aria-label="Navegação principal">
          {GRUPOS.map((g) => (
            <div key={g.titulo}>
              <p className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{g.titulo}</p>
              <div className="space-y-0.5">
                {g.itens.map((h) => (
                  <SideItem key={h} href={h} path={path} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-3 space-y-0.5 border-t border-slate-200/80 pt-3 dark:border-white/[0.06]">
          <SideItem href="/configuracoes" path={path} />
          <div className="flex items-center gap-1 px-1 pt-1">
            <IconButton label={dark ? "Modo claro" : "Modo escuro"} onClick={toggle}>
              {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </IconButton>
            <button onClick={signOut} className="ml-auto flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400">
              <LogOut className="size-4" /> Sair
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* topo (celular) */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/70 bg-slate-50/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl lg:hidden dark:border-white/[0.06] dark:bg-navy-950/80">
          <Logo />
          <IconButton label={dark ? "Modo claro" : "Modo escuro"} onClick={toggle}>
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </IconButton>
        </header>

        {error && (
          <div role="alert" className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200 lg:mx-8 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20">
            <span>Não foi possível carregar seus dados: {error}</span>
            <button className="font-semibold underline" onClick={reload}>
              Tentar de novo
            </button>
          </div>
        )}

        <main className="mx-auto max-w-7xl animate-in px-4 pb-32 pt-5 lg:px-10 lg:pb-14 lg:pt-9">{children}</main>
      </div>

      {/* botão de ação rápida */}
      <button
        onClick={() => setQuick((q) => !q)}
        aria-label="Adicionar"
        aria-expanded={quick}
        className="fixed bottom-[calc(1.1rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex size-14 -translate-x-1/2 items-center justify-center rounded-2xl bg-brand-400 text-navy-950 shadow-[0_12px_32px_-8px_rgb(183_240_0/0.6)] ring-4 ring-slate-50 transition hover:bg-brand-300 active:scale-95 lg:bottom-8 lg:left-auto lg:right-8 lg:translate-x-0 lg:ring-0 dark:ring-navy-950"
      >
        <Plus className={cx("size-7 transition-transform duration-200", quick && "rotate-45")} strokeWidth={2.4} />
      </button>
      {quick && <QuickAddMenu onClose={() => setQuick(false)} />}

      {/* navegação inferior (celular) */}
      <nav aria-label="Navegação rápida" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden dark:border-white/[0.06] dark:bg-navy-950/90">
        {MOBILE.slice(0, 2).map((h) => (
          <MobileItem key={h} href={h} path={path} />
        ))}
        <span />
        <MobileItem href={MOBILE[2]} path={path} />
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium text-slate-500 transition active:scale-95 dark:text-slate-400">
          <Menu className="size-[22px]" strokeWidth={1.9} />
          Mais
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-[2px]" />
          <div
            role="dialog"
            aria-label="Todas as seções"
            className="absolute inset-x-0 bottom-0 max-h-[88dvh] animate-sheet overflow-y-auto rounded-t-[2rem] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] ring-1 ring-slate-200 dark:bg-navy-900 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-white/15" />
            <div className="space-y-4">
              {[...GRUPOS, { titulo: "Conta", itens: ["/configuracoes"] }].map((g) => (
                <div key={g.titulo}>
                  <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{g.titulo}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {g.itens.map((h) => {
                      const n = navItem(h);
                      const ativo = isActive(path, h);
                      return (
                        <Link
                          key={h}
                          href={h}
                          className={cx(
                            "flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-center text-xs font-medium transition active:scale-95",
                            ativo ? "bg-navy-950 text-brand-400 dark:bg-brand-400/10 dark:ring-1 dark:ring-brand-400/30" : "bg-slate-50 text-slate-700 dark:bg-white/[0.03] dark:text-slate-300",
                          )}
                        >
                          <n.icon className="size-5" strokeWidth={1.9} />
                          {n.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={toggle} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-xs font-medium text-slate-700 dark:bg-white/[0.03] dark:text-slate-300">
                  {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  {dark ? "Modo claro" : "Modo escuro"}
                </button>
                <button onClick={signOut} className="flex items-center justify-center gap-2 rounded-2xl bg-rose-500/10 px-3 py-3 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  <LogOut className="size-4" />
                  Sair
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SideItem({ href, path }: { href: string; path: string }) {
  const n = navItem(href);
  const ativo = isActive(path, href);
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={cx(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-150",
        ativo
          ? "bg-navy-950 font-semibold text-white dark:bg-white/[0.06]"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-white",
      )}
    >
      {ativo && <span className="absolute -left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand-400 shadow-[0_0_12px_rgb(183_240_0/0.8)]" />}
      <n.icon className={cx("size-[18px] transition", ativo ? "text-brand-400" : "text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200")} strokeWidth={ativo ? 2.2 : 1.9} />
      {n.label}
    </Link>
  );
}

function MobileItem({ href, path }: { href: string; path: string }) {
  const n = navItem(href);
  const active = isActive(path, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx("relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] transition active:scale-95", active ? "font-semibold text-navy-950 dark:text-brand-400" : "font-medium text-slate-500 dark:text-slate-400")}
    >
      {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-500 dark:bg-brand-400" />}
      <n.icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.9} />
      {n.label === "Dashboard" ? "Início" : n.label}
    </Link>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
