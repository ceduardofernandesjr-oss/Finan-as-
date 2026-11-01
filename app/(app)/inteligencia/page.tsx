"use client";
import { useState } from "react";
import { CheckCircle2, HelpCircle, OctagonAlert, AlertTriangle } from "lucide-react";
import { useFinance } from "@/lib/store";
import { analyze, canISpend, type SpendAnswer } from "@/lib/finance/insights";
import { PageHeader } from "@/components/shell";
import { Button, Card, CardTitle, Field, MoneyInput, Skeleton, cx } from "@/components/ui";
import { CategorySelect } from "@/components/forms/fields";
import { InsightCard } from "@/components/insight-card";

export default function IntelligencePage() {
  const { data, entries, today, loading } = useFinance();
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [answer, setAnswer] = useState<SpendAnswer | null>(null);

  if (loading) return <Skeleton className="h-96" />;
  const insights = analyze(data, today, entries);

  const ask = () => {
    if (amount <= 0) return;
    setAnswer(canISpend(data, today, amount, category));
  };
  const tone = answer?.verdict === "sim" ? "green" : answer?.verdict === "cuidado" ? "amber" : "red";

  return (
    <>
      <PageHeader title="Inteligência financeira" sub="Análises feitas com os seus lançamentos — nada inventado" />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
        <div className="lg:col-span-2">
          <Card className="lg:sticky lg:top-6">
            <CardTitle sub="Olha seu saldo, as contas, faturas e parcelas dos próximos 30 dias, o que vai entrar e o orçamento da categoria">
              <span className="flex items-center gap-2"><HelpCircle className="size-4 text-navy-500" />Posso gastar?</span>
            </CardTitle>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <Field label="Quanto você quer gastar hoje?">
                <MoneyInput value={amount} onChange={(v) => { setAmount(v); setAnswer(null); }} />
              </Field>
              <Field label="Em qual categoria? (opcional)">
                <CategorySelect kind="despesa" value={category} onChange={(v) => { setCategory(v); setAnswer(null); }} emptyLabel="Qualquer uma" />
              </Field>
              <Button type="submit" className="w-full" disabled={amount <= 0}>Analisar</Button>
            </form>
            {answer && (
              <div
                className={cx(
                  "mt-4 animate-in rounded-xl p-4",
                  tone === "green" && "bg-emerald-50 dark:bg-emerald-500/10",
                  tone === "amber" && "bg-amber-50 dark:bg-amber-500/10",
                  tone === "red" && "bg-rose-50 dark:bg-rose-500/10",
                )}
              >
                <p className="flex items-center gap-2 font-semibold">
                  {tone === "green" && <CheckCircle2 className="size-5 text-emerald-600" />}
                  {tone === "amber" && <AlertTriangle className="size-5 text-amber-600" />}
                  {tone === "red" && <OctagonAlert className="size-5 text-rose-600" />}
                  {answer.title}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {answer.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
                {!data.accounts.length && <p className="mt-2 text-xs text-slate-500">Cadastre suas contas para uma resposta precisa.</p>}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
