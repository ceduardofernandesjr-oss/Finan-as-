"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, Download, FileSpreadsheet, LogOut, Monitor, Moon, Pencil, Plus, Sun, Trash2, Upload } from "lucide-react";
import { useFinance } from "@/lib/store";
import type { Category, CategoryKind } from "@/lib/types";
import { supabase } from "@/lib/supabase/client";
import { exportBackup, exportExcel } from "@/lib/export";
import { todayISO } from "@/lib/finance/dates";
import { PageHeader } from "@/components/shell";
import { Button, Card, CardTitle, Dot, Field, IconButton, Input, Segmented } from "@/components/ui";
import { useForms } from "@/components/forms/provider";
import { useAction, useFeedback } from "@/components/feedback";
import { Importer } from "@/components/importer";

function ThemeChooser() {
  const [mode, setMode] = useState<"claro" | "escuro" | "auto">("auto");
  useEffect(() => {
    try {
      setMode((localStorage.getItem("tema") as "claro" | "escuro") ?? "auto");
    } catch {}
  }, []);
  const apply = (m: typeof mode) => {
    setMode(m);
    try {
      if (m === "auto") localStorage.removeItem("tema");
      else localStorage.setItem("tema", m);
    } catch {}
    const dark = m === "escuro" || (m === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  };
  return (
    <Segmented
      value={mode}
      onChange={apply}
      options={[
        { value: "claro", label: <span className="flex items-center gap-1.5"><Sun className="size-4" />Claro</span> },
        { value: "escuro", label: <span className="flex items-center gap-1.5"><Moon className="size-4" />Escuro</span> },
        { value: "auto", label: <span className="flex items-center gap-1.5"><Monitor className="size-4" />Automático</span> },
      ]}
    />
  );
}

function Categories() {
  const { data, remove } = useFinance();
  const forms = useForms();
  const { confirm } = useFeedback();
  const { exec } = useAction();
  const [kind, setKind] = useState<CategoryKind>("despesa");
  const roots = data.categories.filter((c) => c.kind === kind && !c.parent_id);
  const del = async (c: Category) => {
    const used = data.transactions.filter((t) => t.category_id === c.id).length + data.purchases.filter((p) => p.category_id === c.id).length;
    const subs = data.categories.filter((x) => x.parent_id === c.id).length;
    const ok = await confirm({
      title: `Excluir "${c.name}"?`,
      text: `${used ? `${used} lançamentos ficarão sem categoria. ` : ""}${subs ? `As ${subs} subcategorias também serão excluídas. ` : ""}${data.budgets.some((b) => b.category_id === c.id) ? "O limite de orçamento desta categoria será removido." : ""}`,
      danger: true,
      confirmLabel: "Excluir",
    });
    if (ok) await exec(() => remove("categories", c.id), "Categoria excluída");
  };
  const Row = ({ c, sub }: { c: Category; sub?: boolean }) => (
    <li className={sub ? "flex items-center gap-2 py-1.5 pl-6 text-sm" : "flex items-center gap-2 py-2 text-sm font-medium"}>
      <Dot color={c.color} />
      <span className="flex-1 truncate">{c.name}</span>
      {!sub && (
        <IconButton label="Nova subcategoria" className="size-8" onClick={() => forms.openCategory({ kind, parentId: c.id })}>
          <Plus className="size-4" />
        </IconButton>
      )}
      <IconButton label="Editar" className="size-8" onClick={() => forms.openCategory({ category: c })}><Pencil className="size-3.5" /></IconButton>
      <IconButton label="Excluir" className="size-8 hover:text-rose-600" onClick={() => del(c)}><Trash2 className="size-3.5" /></IconButton>
    </li>
  );
  return (
    <Card>
      <CardTitle action={<Button size="sm" onClick={() => forms.openCategory({ kind })} icon={<Plus className="size-4" />}>Categoria</Button>}>Categorias</CardTitle>
      <Segmented className="mb-3" value={kind} onChange={setKind} options={[{ value: "despesa", label: "Despesas" }, { value: "receita", label: "Receitas" }]} />
      <ul className="divide-y divide-slate-100 dark:divide-navy-800">
        {roots.map((r) => (
          <Fragment key={r.id}>
            <Row c={r} />
            {data.categories.filter((c) => c.parent_id === r.id).map((s) => <Row key={s.id} c={s} sub />)}
          </Fragment>
        ))}
      </ul>
    </Card>
  );
}

function Backup() {
  const { data, entries, restoreBackup } = useFinance();
  const { confirm, toast } = useFeedback();
  const { busy, exec } = useAction();
  const xls = useAction();
  const file = useRef<HTMLInputElement>(null);
  const restore = async (f: File) => {
    let payload: unknown;
    try {
      payload = JSON.parse(await f.text());
    } catch {
      toast("Arquivo de backup inválido.", "error");
      return;
    }
    const p = payload as { app?: string; exported_at?: string; transactions?: unknown[] };
    if (p.app !== "financas-pessoais") return toast("Este arquivo não é um backup deste app.", "error");
    const ok = await confirm({
      title: "Restaurar backup?",
      text: `Todos os seus dados atuais serão SUBSTITUÍDOS pelos do backup de ${p.exported_at ? new Date(p.exported_at).toLocaleString("pt-BR") : "data desconhecida"} (${p.transactions?.length ?? 0} lançamentos). Faça um backup do estado atual antes, se quiser guardar.`,
      danger: true,
      confirmLabel: "Substituir meus dados",
    });
    if (ok) await exec(() => restoreBackup(payload), "Backup restaurado");
    if (file.current) file.current.value = "";
  };
  return (
    <Card>
      <CardTitle sub="Seus dados ficam no seu banco Supabase. Aqui você leva uma cópia para onde quiser.">Importar, exportar e backup</CardTitle>
      <div className="flex flex-wrap gap-2">
        <Importer />
        <Button variant="secondary" loading={xls.busy} icon={<FileSpreadsheet className="size-4" />} onClick={() => xls.exec(() => exportExcel(data, entries, "1900-01-01", "2999-12-31", `completo-${todayISO()}`), "Planilha gerada")}>
          Exportar tudo em Excel
        </Button>
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => exportBackup(data)}>Fazer backup</Button>
        <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        <Button variant="secondary" loading={busy} icon={<Upload className="size-4" />} onClick={() => file.current?.click()}>Restaurar backup</Button>
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
        <DatabaseBackup className="mt-0.5 size-4 shrink-0" />
        O CSV/Excel precisa de colunas de data, descrição e valor (o app tenta reconhecer sozinho; extratos de banco costumam funcionar). Relatórios em PDF ficam em Relatórios.
      </p>
    </Card>
  );
}

function AccountSettings() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, exec } = useAction();
  useEffect(() => {
    supabase().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);
  const change = async () => {
    if (password.length < 8) return exec(async () => { throw new Error("A senha precisa ter pelo menos 8 caracteres."); });
    const ok = await exec(async () => {
      const { error } = await supabase().auth.updateUser({ password });
      if (error) throw new Error(error.message);
    }, "Senha alterada");
    if (ok) setPassword("");
  };
  return (
    <Card>
      <CardTitle sub={email}>Sua conta</CardTitle>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Nova senha" className="min-w-56 flex-1">
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Pelo menos 8 caracteres" />
        </Field>
        <Button onClick={change} loading={busy} disabled={!password}>Alterar senha</Button>
        <Button
          variant="secondary"
          icon={<LogOut className="size-4" />}
          onClick={async () => {
            await supabase().auth.signOut();
            router.replace("/entrar");
            router.refresh();
          }}
        >
          Sair
        </Button>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <CardTitle>Aparência</CardTitle>
            <ThemeChooser />
          </Card>
          <Backup />
          <AccountSettings />
        </div>
        <Categories />
      </div>
    </>
  );
}
