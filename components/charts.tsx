"use client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";
import { formatMoney, formatMoneyCompact } from "@/lib/finance/money";
import { Dot } from "./ui";

// Cores dos gráficos vêm de variáveis CSS (globals.css): mudam sozinhas entre tema escuro e claro.
// No escuro a cor principal é o verde-limão; no claro, o preto (o limão fica nas receitas).
export const C = {
  income: "var(--chart-income)",
  expense: "var(--chart-expense)",
  navy: "var(--chart-primary)",
  navyLight: "var(--chart-primary-soft)",
  amber: "#f5b83d",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
};
const CURSOR = { fill: "var(--chart-cursor)" };
/** Rampa da marca para distribuição por categoria (do maior para o menor). */
export const RAMPA = ["#b7f000", "#7fa800", "#d9f383", "#45936f", "#858b84", "#c2c6bd", "#4b524b", "#e7c84a"];

const axisProps = {
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl bg-white/95 px-3.5 py-2.5 text-xs shadow-xl ring-1 ring-slate-200 backdrop-blur dark:bg-navy-950/95 dark:ring-white/10">
      {label && <p className="mb-1.5 font-semibold text-slate-900 dark:text-white">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <Dot color={p.color} />
          {p.name}: <span className="money font-semibold text-slate-900 dark:text-white">{formatMoney(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

const yMoney = (v: number) => formatMoneyCompact(v);

export function IncomeExpenseChart({ data }: { data: { label: string; receitas: number; despesas: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} barGap={2} margin={{ left: 0, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis tickFormatter={yMoney} width={84} {...axisProps} />
        <Tooltip content={<MoneyTooltip />} cursor={CURSOR} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar name="Receitas" dataKey="receitas" fill={C.income} radius={[8, 8, 2, 2]} maxBarSize={28} />
        <Bar name="Despesas" dataKey="despesas" fill={C.expense} radius={[8, 8, 2, 2]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ data, height = 190 }: { data: { name: string; amount: number; color: string; pct: number }[]; height?: number }) {
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, d) => s + d.amount, 0);
  // cores da marca por posição (maior gasto = limão), para o gráfico seguir a identidade visual
  const rows = (rest > 0 ? [...top, { name: "Outras", amount: rest, color: "", pct: 0 }] : top).map((r, i) => ({ ...r, color: RAMPA[i % RAMPA.length] }));
  const total = data.reduce((s, d) => s + d.amount, 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <PieChart width={height} height={height}>
            <Pie data={rows} dataKey="amount" nameKey="name" innerRadius="68%" outerRadius="96%" paddingAngle={2.5} cornerRadius={6} stroke="none">
            {rows.map((r) => (
              <Cell key={r.name} fill={r.color} />
            ))}
          </Pie>
            <Tooltip content={<MoneyTooltip />} />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Total</span>
          <span className="money text-sm font-semibold sm:text-base">{formatMoney(total)}</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <Dot color={r.color} />
            <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{r.name}</span>
            <span className="money font-semibold">{formatMoney(r.amount)}</span>
            <span className="tabular w-10 text-right text-xs text-slate-400">{total ? Math.round((r.amount / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LineMoneyChart({
  data,
  lines,
  height = 240,
  zeroLine,
}: {
  data: Record<string, number | string>[];
  lines: { key: string; name: string; color: string; dashed?: boolean }[];
  height?: number;
  zeroLine?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis tickFormatter={yMoney} width={84} {...axisProps} />
        <Tooltip content={<MoneyTooltip />} />
        {lines.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {zeroLine && <ReferenceLine y={0} stroke={C.expense} strokeDasharray="4 4" />}
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            name={l.name}
            dataKey={l.key}
            stroke={l.color}
            strokeWidth={2.5}
            strokeDasharray={l.dashed ? "6 4" : undefined}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaMoneyChart({ data, dataKey, name, color = C.navy, height = 220, zeroLine }: {
  data: Record<string, number | string>[];
  dataKey: string;
  name: string;
  color?: string;
  height?: number;
  zeroLine?: boolean;
}) {
  const id = `g-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis tickFormatter={yMoney} width={84} {...axisProps} />
        <Tooltip content={<MoneyTooltip />} />
        {zeroLine && <ReferenceLine y={0} stroke={C.expense} strokeDasharray="4 4" />}
        <Area type="monotone" name={name} dataKey={dataKey} stroke={color} strokeWidth={2.5} fill={`url(#${id})`} activeDot={{ r: 5, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CashFlowChart({ data }: { data: { label: string; entradas: number; saidas: number; liquido: number }[] }) {
  const rows = data.map((d) => ({ ...d, saidasNeg: -d.saidas }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} stackOffset="sign" margin={{ left: 0, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis tickFormatter={yMoney} width={84} {...axisProps} />
        <Tooltip content={<MoneyTooltip />} cursor={CURSOR} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke={C.axis} />
        <Bar name="Entradas" dataKey="entradas" stackId="a" fill={C.income} radius={[8, 8, 2, 2]} maxBarSize={28} />
        <Bar name="Saídas" dataKey="saidasNeg" stackId="a" fill={C.expense} radius={[8, 8, 2, 2]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({ data }: { data: { name: string; atual: number; anterior: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" tickFormatter={yMoney} {...axisProps} />
        <YAxis type="category" dataKey="name" width={110} {...axisProps} />
        <Tooltip content={<MoneyTooltip />} cursor={CURSOR} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar name="Período anterior" dataKey="anterior" fill={C.navyLight} radius={[0, 6, 6, 0]} maxBarSize={14} />
        <Bar name="Período atual" dataKey="atual" fill={C.navy} radius={[0, 6, 6, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
