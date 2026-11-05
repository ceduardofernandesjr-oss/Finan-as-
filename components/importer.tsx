"use client";
import { useMemo, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { useFinance } from "@/lib/store";
import { guessMapping, norm, parseRows, readFile, type Mapping, type Sheet } from "@/lib/import";
import { formatBR } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { Modal, useAction, useFeedback } from "./feedback";
import { Badge, Button, Field, Select, Toggle, cx } from "./ui";
import { AccountSelect } from "./forms/fields";

export function Importer() {
  const { data, insert } = useFinance();
  const { toast } = useFeedback();
  const { busy, exec } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<Mapping | null>(null);
  const [account, setAccount] = useState<string | null>(data.accounts.find((a) => !a.archived)?.id ?? null);
  const [paid, setPaid] = useState(true);
  const [skip, setSkip] = useState<Set<number>>(new Set());

  const rows = useMemo(() => (sheet && map ? parseRows(sheet, map, data.categories) : []), [sheet, map, data.categories]);
  const existing = useMemo(
    () => new Set(data.transactions.map((t) => `${t.due_date}|${t.amount}|${norm(t.description)}`)),
    [data.transactions],
  );
  const dupes = useMemo(
    () => new Set(rows.filter((r) => r.date && r.amount && existing.has(`${r.date}|${r.amount}|${norm(r.description)}`)).map((r) => r.index)),
    [rows, existing],
  );
  const selected = rows.filter((r) => !r.error && !skip.has(r.index));

  const open = async (file: File) => {
    try {
      const s = await readFile(file);
      if (!s.rows.length) return toast("Não encontrei linhas no arquivo.", "error");
      const m = guessMapping(s.headers);
      if (!account) setAccount(data.accounts.find((a) => !a.archived)?.id ?? null);
      setSheet(s);
      setMap(m);
      setFileName(file.name);
      const parsed = parseRows(s, m, data.categories);
      // linhas que parecem já cadastradas começam desmarcadas
      setSkip(new Set(parsed.filter((r) => r.date && r.amount && existing.has(`${r.date}|${r.amount}|${norm(r.description)}`)).map((r) => r.index)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui ler o arquivo.", "error");
    }
  };

  const doImport = async () => {
    if (paid && !account) return toast("Escolha a conta das movimentações.", "error");
    const payload = selected.map((r) => ({
      kind: r.kind,
      description: r.description,
      amount: r.amount!,
      due_date: r.date!,
      paid_date: paid ? r.date! : null,
      account_id: account,
      category_id: r.category_id,
      payment_method: "",
      notes: `Importado de ${fileName}`.slice(0, 1000),
    }));
    const ok = await exec(async () => {
      for (let i = 0; i < payload.length; i += 500) await insert("transactions", payload.slice(i, i + 500));
    }, `${payload.length} movimentações importadas`);
    if (ok) close();
  };

  const close = () => {
    setSheet(null);
    setMap(null);
    setSkip(new Set());
    if (input.current) input.current.value = "";
  };

  const colSelect = (key: keyof Mapping, optional?: string) =>
    sheet && map ? (
      <Select value={map[key]} onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}>
        {optional && <option value={-1}>{optional}</option>}
        {sheet.headers.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
      </Select>
    ) : null;

  return (
    <>
      <input ref={input} type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
      <Button variant="secondary" onClick={() => input.current?.click()} icon={<FileUp className="size-4" />}>Importar CSV ou Excel</Button>
      <Modal
        open={!!sheet}
        onClose={close}
        size="lg"
        title={`Importar ${fileName}`}
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button onClick={doImport} loading={busy} disabled={!selected.length}>Importar {selected.length}</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          Confira quais colunas são o quê. Valores negativos viram despesas e positivos, receitas (a não ser que haja uma coluna de tipo).
          Categorias com o mesmo nome das suas são ligadas automaticamente.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Data">{colSelect("date")}</Field>
          <Field label="Descrição">{colSelect("description")}</Field>
          <Field label="Valor">{colSelect("amount")}</Field>
          <Field label="Categoria">{colSelect("category", "Nenhuma")}</Field>
          <Field label="Tipo">{colSelect("type", "Pelo sinal do valor")}</Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Conta"><AccountSelect value={account} onChange={setAccount} /></Field>
          <div className="self-end"><Toggle checked={paid} onChange={setPaid} label="Já foram pagas/recebidas" /></div>
        </div>
        {dupes.size > 0 && <p className="mt-3 text-xs text-amber-700">{dupes.size} linhas parecem já estar cadastradas e foram desmarcadas.</p>}
        <div className="mt-3 max-h-80 overflow-auto rounded-xl ring-1 ring-slate-200 dark:ring-navy-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 dark:bg-navy-950">
              <tr><th className="w-8 p-2" /><th className="p-2 text-left">Data</th><th className="p-2 text-left">Descrição</th><th className="p-2 text-left">Categoria</th><th className="p-2 text-right">Valor</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-800">
              {rows.slice(0, 1000).map((r) => (
                <tr key={r.index} className={cx(r.error && "bg-rose-50/60 dark:bg-rose-500/10")}>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand-500"
                      disabled={!!r.error}
                      checked={!r.error && !skip.has(r.index)}
                      onChange={(e) => {
                        const s = new Set(skip);
                        if (e.target.checked) s.delete(r.index);
                        else s.add(r.index);
                        setSkip(s);
                      }}
                    />
                  </td>
                  <td className="whitespace-nowrap p-2">{r.date ? formatBR(r.date) : "—"}</td>
                  <td className="p-2">
                    {r.description || "—"} {r.error && <Badge tone="red">{r.error}</Badge>} {dupes.has(r.index) && <Badge tone="amber">já existe?</Badge>}
                  </td>
                  <td className="p-2 text-xs text-slate-500">{r.category_id ? r.categoryName : r.categoryName ? `${r.categoryName} (não encontrada)` : "—"}</td>
                  <td className={cx("tabular whitespace-nowrap p-2 text-right", r.kind === "receita" ? "text-emerald-600 dark:text-brand-400" : "")}>
                    {r.amount ? `${r.kind === "receita" ? "+" : "−"} ${formatMoney(r.amount)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 1000 && <p className="mt-2 text-xs text-slate-500">Mostrando 1000 de {rows.length} linhas; todas as válidas marcadas serão importadas.</p>}
      </Modal>
    </>
  );
}
