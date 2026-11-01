"use client";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";
import { formatMoney, formatMoneyCompact } from "@/lib/finance/money";
import { Dot } from "./ui";

export const C = {
  income: "#10b981",
  expense: "#f43f5e",
  navy: "#3150a6",
  navyLight: "#8098d9",
  amber: "#f59e0b",
  grid: "#94a3b833",
  axis: "#94a3b8",
};

const axisProps = {
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200 dark:bg-navy-800 dark:ring-navy-700">
      {label && <p className="mb-1 font-medium text-slate-700 dark:text-slate-200">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <Dot color={p.color} />
          {p.name}: <span className="tabular font-medium text-slate-900 dark:text-white">{formatMoney(Number(p.value))}</span>
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
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: "#94a3b81a" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar name="Receitas" dataKey="receitas" fill={C.income} radius={[6, 6, 0, 0]} maxBarSize={28} />
        <Bar name="Despesas" dataKey="despesas" fill={C.expense} radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ data, height = 190 }: { data: { name: string; amount: number; color: string; pct: number }[]; height?: number }) {
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, d) => s + d.amount, 0);
  const rows = rest > 0 ? [...top, { name: "Outras", amount: rest, color: "#94a3b8", pct: 0 }] : top;
  const total = data.reduce((s, d) => s + d.amount, 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <PieChart width={height} height={height}>
            <Pie data={rows} dataKey="amount" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={2} stroke="none">
            {rows.map((r) => (
              <Cell key={r.name} fill={r.color} />
            ))}
          </Pie>
            <Tooltip content={<MoneyTooltip />} />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-slate-500">Total</span>
          <span className="tabular text-xs font-semibold sm:text-sm">{formatMoney(total)}</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <Dot color={r.color} />
            <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{r.name}</span>
            <span className="tabular font-medium">{formatMoney(r.amount)}</span>
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
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis tickFormatter={yMoney} width={84} {...axisProps} />
        <Tooltip content={<MoneyTooltip />} />
        {zeroLine && <ReferenceLine y={0} stroke={C.expense} strokeDasharray="4 4" />}
        <Area type="monotone" name={name} dataKey={dataKey} stroke={color} strokeWidth={2.5} fill={`url(#${id})`} />
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
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: "#94a3b81a" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke={C.axis} />
        <Bar name="Entradas" dataKey="entradas" stackId="a" fill={C.income} radius={[6, 6, 0, 0]} maxBarSize={28} />
        <Bar name="Saídas" dataKey="saidasNeg" stackId="a" fill={C.expense} radius={[6, 6, 0, 0]} maxBarSize={28} />
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
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: "#94a3b81a" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar name="Período anterior" dataKey="anterior" fill={C.navyLight} radius={[0, 6, 6, 0]} maxBarSize={14} />
        <Bar name="Período atual" dataKey="atual" fill={C.navy} radius={[0, 6, 6, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
