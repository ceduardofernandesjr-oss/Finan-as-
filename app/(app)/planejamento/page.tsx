"use client";
import { useState } from "react";
import { Minus, Pencil, PiggyBank, Plus, Target, Trash2 } from "lucide-react";
import { useFinance } from "@/lib/store";
import type { Goal } from "@/lib/types";
import { addDays, addMonths, diffDays, formatBR, monthKey, monthLabelFull, monthStart } from "@/lib/finance/dates";
import { budgetStatus, projectBalance } from "@/lib/finance/reports";
import { formatMoney, pct, sum } from "@/lib/finance/money";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardTitle, EmptyState, Field, IconButton, Money, MoneyInput, Progress, Segmented, Skeleton, cx } from "@/components/ui";
import { AreaMoneyChart, C } from "@/components/charts";
import { useForms } from "@/components/forms/provider";
import { Modal, useAction, useFeedback } from "@/components/feedback";

function GoalMove({ goal, mode, onClose }: { goal: Goal; mode: "add" | "sub"; onClose: () => void }) {
  const { update } = useFinance();
  const { busy, exec } = useAction();
  const [amount, setAmount] = useState(0);
  const save = async () => {
    if (amount <= 0) return;
    const saved = mode === "add" ? goal.saved + amount : Math.max(0, goal.saved - amount);
    if (await exec(() => update("goals", goal.id, { saved }), mode === "add" ? "Valor guardado" : "Valor retirado")) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${mode === "add" ? "Guardar em" : "Retirar de"} ${goal.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={busy}>{mode === "add" ? "Guardar" : "Retirar"}</Button></>}
    >
      <Field label="Valor" hint={`Guardado hoje: ${formatMoney(goal.saved)}. Isto só controla a meta; para mover dinheiro entre contas, use uma transferência.`}>
        <MoneyInput value={amount} onChange={setAmount} autoFocus />
      </Field>
    </Modal>
  );
}

export default function PlanningPage() {
  const { data, entries, today, loading, remove } = useFinance();
  const forms = useForms();
  const { confirm } = useFeedback();
  const { exec } = useAction();
  const [monthOffset, setMonthOffset] = useState(0);
  const [horizon, setHorizon] = useState<"30" | "90" | "180">("90");
  const [move, setMove] = useState<{ goal: Goal; mode: "add" | "sub" } | null>(null);

  if (loading) return <Skeleton className="h-96" />;

  const month = monthKey(addMonths(monthStart(today), monthOffset));
  const budgets = budgetStatus(data.budgets, data.categories, entries, month);
  const totalBudget = sum(budgets.map((b) => b.budget.amount));
  const totalSpent = sum(budgets.map((b) => b.spent));
  const proj = projectBalance(data, today, addDays(today, Number(horizon)));
  const series = proj.series.filter((_, i) => i % (horizon === "30" ? 1 : horizon === "90" ? 3 : 6) === 0 || _ === proj.series.at(-1)).map((p) => ({ label: `${p.date.slice(8)}/${p.date.slice(5, 7)}`, saldo: p.saldo }));
  const goalsByKind = (k: Goal["kind"]) => data.goals.filter((g) => g.kind === k);

  const delBudget = async (id: string) => {
    if (await confirm({ title: "Remover este limite?", danger: true, confirmLabel: "Remover" })) await exec(() => remove("budgets", id), "Limite removido");
  };
  const delGoal = async (g: Goal) => {
    if (await confirm({ title: `Excluir a meta ${g.name}?`, danger: true, confirmLabel: "Excluir" })) await exec(() => remove("goals", g.id), "Meta excluída");
  };

  const GoalList = ({ list }: { list: Goal[] }) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {list.map((g) => {
        const p = pct(g.saved, g.target);
        const months = g.deadline ? Math.max(1, Math.ceil(diffDays(g.deadline, today) / 30.44)) : 0;
        const late = g.deadline && g.deadline < today && g.saved < g.target;
        return (
          <div key={g.id} className="rounded-xl bg-slate-50 p-4 dark:bg-navy-950">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{g.name}</p>
                <p className="text-xs text-slate-500">
                  <Money value={g.saved} /> de <Money value={g.target} />
                  {g.deadline && <> · até {formatBR(g.deadline)}</>}
                </p>
              </div>
              {p >= 100 ? <Badge tone="green">Concluída</Badge> : late ? <Badge tone="red">Prazo vencido</Badge> : null}
              <IconButton label="Editar" onClick={() => forms.openGoal({ goal: g })}><Pencil className="size-4" /></IconButton>
              <IconButton label="Excluir" onClick={() => delGoal(g)} className="hover:text-rose-600"><Trash2 className="size-4" /></IconButton>
            </div>
            <div className="mt-3"><Progress value={p} tone={p >= 100 ? "green" : "navy"} /></div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {p >= 100
                  ? "Meta atingida!"
                  : months && !late
                    ? `Guarde ${formatMoney(Math.ceil((g.target - g.saved) / months))}/mês`
                    : `Faltam ${formatMoney(g.target - g.saved)}`}
              </p>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => setMove({ goal: g, mode: "sub" })} icon={<Minus className="size-3.5" />}>Retirar</Button>
                <Button size="sm" onClick={() => setMove({ goal: g, mode: "add" })} icon={<Plus className="size-3.5" />}>Guardar</Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <PageHeader title="Planejamento" sub="Orçamento, metas, reserva de emergência e projeção do saldo" />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle
            sub={
              <span className="flex items-center gap-2">
                <button onClick={() => setMonthOffset(monthOffset - 1)} className="underline">‹</button>
                <span>{monthLabelFull(month)}</span>
                <button onClick={() => setMonthOffset(monthOffset + 1)} className="underline">›</button>
              </span>
            }
            action={<Button size="sm" onClick={() => forms.openBudget()} icon={<Plus className="size-4" />}>Limite</Button>}
          >
            Orçamento mensal por categoria
          </CardTitle>
          {budgets.length ? (
            <>
              <div className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-navy-950">
                <div className="mb-1 flex justify-between text-sm">
                  <span>Total gasto</span>
                  <span><Money value={totalSpent} className="font-semibold" /> de <Money value={totalBudget} /></span>
                </div>
                <Progress value={pct(totalSpent, totalBudget)} />
              </div>
              <ul className="space-y-4">
                {budgets.map((b) => (
                  <li key={b.budget.id}>
                    <div className="mb-1 flex items-center gap-2 text-sm">
                      <span className="size-2.5 rounded-full" style={{ background: b.category?.color }} />
                      <span className="flex-1 truncate">{b.category?.name ?? "Categoria removida"}</span>
                      {b.level === "alerta" && <Badge tone="amber">Perto do limite</Badge>}
                      {b.level === "estourado" && <Badge tone="red">Estourou</Badge>}
                      <IconButton label="Editar" onClick={() => forms.openBudget(b.budget)} className="size-7"><Pencil className="size-3.5" /></IconButton>
                      <IconButton label="Remover" onClick={() => delBudget(b.budget.id)} className="size-7 hover:text-rose-600"><Trash2 className="size-3.5" /></IconButton>
                    </div>
                    <Progress value={b.pct} />
                    <p className="mt-1 text-xs text-slate-500">
                      <Money value={b.spent} /> de <Money value={b.budget.amount} /> ·{" "}
                      <span className={cx(b.remaining < 0 && "text-rose-600")}>{b.remaining >= 0 ? "restam" : "passou"} <Money value={Math.abs(b.remaining)} /></span>
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState
              icon={<Target className="size-6" />}
              title="Defina limites de gastos"
              text="Escolha categorias e um limite por mês. O app avisa quando você chegar a 80%."
              action={<Button onClick={() => forms.openBudget()} icon={<Plus className="size-4" />}>Criar limite</Button>}
            />
          )}
        </Card>

        <Card>
          <CardTitle
            sub="Saldo das contas + a receber − a pagar − faturas, dia a dia"
            action={<Segmented value={horizon} onChange={setHorizon} options={[{ value: "30", label: "30d" }, { value: "90", label: "90d" }, { value: "180", label: "180d" }]} />}
          >
            Projeção de saldo
          </CardTitle>
          {data.accounts.length ? (
            <>
              <AreaMoneyChart data={series} dataKey="saldo" name="Saldo previsto" color={proj.min.saldo < 0 ? C.expense : C.navy} zeroLine />
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-xs text-slate-500">Hoje</p><Money value={proj.start} className="font-semibold" /></div>
                <div><p className="text-xs text-slate-500">Mais baixo ({formatBR(proj.min.date).slice(0, 5)})</p><Money value={proj.min.saldo} colored={proj.min.saldo < 0} className="font-semibold" /></div>
                <div><p className="text-xs text-slate-500">Em {horizon} dias</p><Money value={proj.end} colored={proj.end < 0} className="font-semibold" /></div>
              </div>
            </>
          ) : (
            <EmptyState title="Cadastre suas contas para ver a projeção" />
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardTitle action={<Button size="sm" onClick={() => forms.openGoal({ kind: "reserva" })} icon={<Plus className="size-4" />}>Reserva</Button>} sub="O ideal é ter de 3 a 6 meses das suas despesas guardados">
          Reserva de emergência
        </CardTitle>
        {goalsByKind("reserva").length ? <GoalList list={goalsByKind("reserva")} /> : <EmptyState icon={<PiggyBank className="size-6" />} title="Nenhuma reserva cadastrada" />}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle action={<Button size="sm" onClick={() => forms.openGoal({ kind: "meta" })} icon={<Plus className="size-4" />}>Meta</Button>} sub="Viagens, estudos, quitar dívidas...">
            Metas e objetivos
          </CardTitle>
          {goalsByKind("meta").length ? <GoalList list={goalsByKind("meta")} /> : <EmptyState title="Nenhuma meta ainda" />}
        </Card>
        <Card>
          <CardTitle action={<Button size="sm" onClick={() => forms.openGoal({ kind: "compra" })} icon={<Plus className="size-4" />}>Compra</Button>} sub="Junte antes e compre à vista">
            Compras planejadas
          </CardTitle>
          {goalsByKind("compra").length ? <GoalList list={goalsByKind("compra")} /> : <EmptyState title="Nenhuma compra planejada" />}
        </Card>
      </div>

      {move && <GoalMove goal={move.goal} mode={move.mode} onClose={() => setMove(null)} />}
    </>
  );
}

