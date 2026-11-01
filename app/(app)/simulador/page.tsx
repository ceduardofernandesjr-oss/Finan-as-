"use client";
import { useMemo, useState } from "react";
import { useFinance } from "@/lib/store";
import { amortizationSchedule, loanStatus, prepaymentValue } from "@/lib/finance/loans";
import { cashVsInstallments } from "@/lib/finance/insights";
import { addMonths, monthStart, monthRange } from "@/lib/finance/dates";
import { resultByMonth } from "@/lib/finance/reports";
import { formatMoney, formatPct, sum } from "@/lib/finance/money";
import { PageHeader } from "@/components/shell";
import { Card, CardTitle, Field, Input, Money, MoneyInput, Segmented, Select, cx } from "@/components/ui";
import { C, LineMoneyChart } from "@/components/charts";

type Tab = "emprestimo" | "parcelado" | "antecipar" | "impacto";

function Rate({ value, onChange, label = "Juros ao mês (%)" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Field label={label}>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, ""))} placeholder="Ex.: 1,99" />
    </Field>
  );
}
const num = (s: string) => Number(s.replace(",", ".")) || 0;

function Row({ label, value, strong, tone }: { label: string; value: React.ReactNode; strong?: boolean; tone?: "green" | "red" }) {
  return (
    <div className={cx("flex justify-between py-1.5 text-sm", strong && "font-semibold")}>
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className={cx("tabular", tone === "green" && "text-emerald-600", tone === "red" && "text-rose-600")}>{value}</span>
    </div>
  );
}

function LoanSim() {
  const [principal, setPrincipal] = useState(1000000);
  const [rate, setRate] = useState("1,99");
  const [n, setN] = useState(24);
  const [system, setSystem] = useState<"price" | "sac">("price");
  const rows = useMemo(() => (principal > 0 && n > 0 && n <= 600 ? amortizationSchedule(principal, num(rate), n, system) : []), [principal, rate, n, system]);
  const total = sum(rows.map((r) => r.payment));
  const other = useMemo(() => (principal > 0 && n > 0 && n <= 600 ? amortizationSchedule(principal, num(rate), n, system === "price" ? "sac" : "price") : []), [principal, rate, n, system]);
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card>
        <CardTitle>Simular empréstimo ou financiamento</CardTitle>
        <div className="space-y-3">
          <Field label="Valor"><MoneyInput value={principal} onChange={setPrincipal} /></Field>
          <Rate value={rate} onChange={setRate} />
          <Field label="Parcelas"><Input type="number" min={1} max={600} value={n} onChange={(e) => setN(Number(e.target.value))} /></Field>
          <Segmented value={system} onChange={setSystem} options={[{ value: "price", label: "Price (parcela fixa)" }, { value: "sac", label: "SAC (decrescente)" }]} />
        </div>
        {rows.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-navy-800">
            <Row label={system === "price" ? "Parcela" : "1ª parcela"} value={formatMoney(rows[0].payment)} strong />
            {system === "sac" && <Row label="Última parcela" value={formatMoney(rows.at(-1)!.payment)} />}
            <Row label="Total pago" value={formatMoney(total)} />
            <Row label="Juros totais" value={formatMoney(total - principal)} tone="red" />
            <Row label={`No ${system === "price" ? "SAC" : "Price"}, os juros seriam`} value={formatMoney(sum(other.map((r) => r.payment)) - principal)} />
          </div>
        )}
      </Card>
      <Card className="lg:col-span-2">
        <CardTitle sub="Quanto de cada parcela é juros e quanto abate a dívida">Tabela de amortização</CardTitle>
        {rows.length > 0 && (
          <>
            <LineMoneyChart data={rows.map((r) => ({ label: String(r.n), saldo: r.balance, juros: r.interest, parcela: r.payment }))} lines={[{ key: "saldo", name: "Saldo devedor", color: C.navy }]} height={200} />
            <div className="mt-3 max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white text-xs text-slate-500 dark:bg-navy-900">
                  <tr><th className="py-1 text-left">Nº</th><th className="text-right">Parcela</th><th className="text-right">Juros</th><th className="text-right">Amortização</th><th className="text-right">Saldo</th></tr>
                </thead>
                <tbody className="tabular">
                  {rows.map((r) => (
                    <tr key={r.n} className="border-t border-slate-100 dark:border-navy-800">
                      <td className="py-1">{r.n}</td><td className="text-right">{formatMoney(r.payment)}</td><td className="text-right text-rose-600">{formatMoney(r.interest)}</td><td className="text-right">{formatMoney(r.amortization)}</td><td className="text-right">{formatMoney(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function InstallmentSim() {
  const [cash, setCash] = useState(90000);
  const [total, setTotal] = useState(100000);
  const [n, setN] = useState(10);
  const [yieldRate, setYieldRate] = useState("0,9");
  const r = cash > 0 && total > 0 && n > 0 ? cashVsInstallments(cash, total, n, num(yieldRate)) : null;
  return (
    <Card className="max-w-2xl">
      <CardTitle sub="Leva em conta quanto o dinheiro renderia enquanto você paga as parcelas">À vista ou parcelado?</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Preço à vista (com desconto)"><MoneyInput value={cash} onChange={setCash} /></Field>
        <Field label="Preço total parcelado"><MoneyInput value={total} onChange={setTotal} /></Field>
        <Field label="Número de parcelas"><Input type="number" min={1} max={72} value={n} onChange={(e) => setN(Number(e.target.value))} /></Field>
        <Rate value={yieldRate} onChange={setYieldRate} label="Rendimento do seu dinheiro ao mês (%)" />
      </div>
      {r && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 dark:bg-navy-950">
          <Row label="Parcela" value={formatMoney(r.parcela)} />
          <Row label="Desconto à vista" value={`${formatMoney(total - cash)} (${formatPct(((total - cash) / total) * 100, 1)})`} />
          <Row label="Valor presente das parcelas" value={formatMoney(r.presentValue)} />
          <p className={cx("mt-3 text-sm font-semibold", r.best === "avista" ? "text-emerald-700 dark:text-emerald-400" : "text-navy-700 dark:text-navy-200")}>
            {r.best === "avista"
              ? `Compensa pagar à vista: você economiza ${formatMoney(r.difference)} em valor de hoje.`
              : `Compensa parcelar e deixar o dinheiro rendendo: vantagem de ${formatMoney(r.difference)} em valor de hoje.`}
          </p>
        </div>
      )}
    </Card>
  );
}

function PrepaySim() {
  const { data, today } = useFinance();
  const active = data.loans.map((l) => loanStatus(l, data.transactions, today)).filter((s) => s.pendingCount > 0);
  const [loanId, setLoanId] = useState(active[0]?.loan.id ?? "");
  const chosen = active.find((s) => s.loan.id === loanId);
  const [installment, setInstallment] = useState(50000);
  const [rate, setRate] = useState("1,99");
  const [remaining, setRemaining] = useState(12);
  const [k, setK] = useState(3);
  const inst = chosen ? chosen.loan.installment_amount : installment;
  const rt = chosen ? Number(chosen.loan.monthly_rate) : num(rate);
  const rem = chosen ? chosen.pendingCount : remaining;
  const kk = Math.min(Math.max(1, k), rem);
  const pay = rem > 0 ? prepaymentValue(inst, rt, rem, kk) : 0;
  return (
    <Card className="max-w-2xl">
      <CardTitle sub="Pagando as últimas parcelas hoje, os juros delas são descontados">Antecipar parcelas</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Empréstimo" className="sm:col-span-2">
          <Select value={loanId} onChange={(e) => setLoanId(e.target.value)}>
            <option value="">Digitar os valores</option>
            {active.map((s) => <option key={s.loan.id} value={s.loan.id}>{s.loan.institution} · {s.pendingCount} parcelas restantes</option>)}
          </Select>
        </Field>
        {!chosen && (
          <>
            <Field label="Valor da parcela"><MoneyInput value={installment} onChange={setInstallment} /></Field>
            <Rate value={rate} onChange={setRate} />
            <Field label="Parcelas restantes"><Input type="number" min={1} value={remaining} onChange={(e) => setRemaining(Number(e.target.value))} /></Field>
          </>
        )}
        <Field label="Quantas antecipar"><Input type="number" min={1} max={rem} value={k} onChange={(e) => setK(Number(e.target.value))} /></Field>
      </div>
      {rem > 0 && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 dark:bg-navy-950">
          <Row label={`${kk} parcelas sem desconto`} value={formatMoney(inst * kk)} />
          <Row label="Você paga hoje" value={formatMoney(pay)} strong />
          <Row label="Economia de juros" value={formatMoney(inst * kk - pay)} tone="green" />
          <Row label="Parcelas que sobram" value={rem - kk} />
          <p className="mt-2 text-xs text-slate-500">O valor exato é o que o banco informar; pelo Código de Defesa do Consumidor, a antecipação dá direito ao desconto proporcional dos juros.</p>
        </div>
      )}
    </Card>
  );
}

function ImpactSim() {
  const { entries, today } = useFinance();
  const [amount, setAmount] = useState(15000);
  const [months, setMonths] = useState(12);
  const last = monthRange(addMonths(monthStart(today), -3), addMonths(monthStart(today), -1));
  const hist = resultByMonth(entries, last).filter((r) => r.receitas || r.despesas);
  const avg = hist.length ? Math.round(sum(hist.map((r) => r.saldo)) / hist.length) : null;
  return (
    <Card className="max-w-2xl">
      <CardTitle sub="Com base na média dos últimos 3 meses fechados">Impacto de uma nova despesa no orçamento</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nova despesa por mês"><MoneyInput value={amount} onChange={setAmount} /></Field>
        <Field label="Por quantos meses"><Input type="number" min={1} max={360} value={months} onChange={(e) => setMonths(Number(e.target.value))} /></Field>
      </div>
      {avg === null ? (
        <p className="mt-4 text-sm text-slate-500">Ainda não há meses completos com lançamentos para calcular a média. Registre suas receitas e despesas e volte aqui.</p>
      ) : (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 dark:bg-navy-950">
          <Row label="Sobra média hoje" value={<Money value={avg} colored />} />
          <Row label="Sobra com a nova despesa" value={<Money value={avg - amount} colored />} strong />
          <Row label={`Custo total em ${months} meses`} value={formatMoney(amount * months)} />
          <p className={cx("mt-2 text-sm", avg - amount < 0 ? "text-rose-600" : "text-emerald-700 dark:text-emerald-400")}>
            {avg - amount < 0
              ? `Essa despesa faria faltar ${formatMoney(amount - avg)} por mês. Seria preciso cortar outros gastos ou aumentar a renda.`
              : `Cabe no orçamento: ainda sobrariam ${formatMoney(avg - amount)} por mês${avg > 0 ? ` (${formatPct(((avg - amount) / avg) * 100)} da sobra atual)` : ""}.`}
          </p>
        </div>
      )}
    </Card>
  );
}

export default function SimulatorPage() {
  const [tab, setTab] = useState<Tab>("emprestimo");
  return (
    <>
      <PageHeader title="Simulador financeiro" sub="Teste decisões antes de tomá-las" />
      <div className="-mx-4 mb-4 overflow-x-auto px-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "emprestimo", label: "Empréstimo" },
            { value: "parcelado", label: "À vista x parcelado" },
            { value: "antecipar", label: "Antecipar parcelas" },
            { value: "impacto", label: "Nova despesa" },
          ]}
        />
      </div>
      {tab === "emprestimo" && <LoanSim />}
      {tab === "parcelado" && <InstallmentSim />}
      {tab === "antecipar" && <PrepaySim />}
      {tab === "impacto" && <ImpactSim />}
    </>
  );
}
