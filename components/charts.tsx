"use client";

import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtAxis, fmtDay, fmtDayLong, fmtNum } from "@/lib/format";
import { Card, CardHeader, cx } from "./ui";
import { IconChart, IconTable } from "./icons";

// Категориальные цвета в фиксированном порядке (проверены валидатором палитры на белом фоне)
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export const NEGATIVE = "#e34948";
const GRID = "#eceef1";
const AXIS = "#8a929e";

export type Series = { key: string; label: string; color: string };

type Point = Record<string, any> & { date: string };

const axisProps = {
  stroke: AXIS,
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-2 text-[13px] text-sub">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function TooltipBox({
  active,
  payload,
  label,
  series,
  format,
  labelFormat,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  series: Series[];
  format: (v: number) => string;
  labelFormat: (l: string) => string;
}) {
  if (!active || !payload?.length || label == null) return null;
  const point = payload[0]?.payload || {};
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 shadow-pop text-[13px] min-w-[150px]">
      <div className="text-muted mb-1">{labelFormat(String(label))}</div>
      {series.map((s) => {
        const v = point[s.key];
        return (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-sub">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-medium text-ink tabular">{v == null ? "нет данных" : format(Math.abs(v))}</span>
          </div>
        );
      })}
    </div>
  );
}

// Таблица вместо графика: те же значения текстом
function DataTable({
  data,
  series,
  format,
  labelFormat,
  labelTitle,
}: {
  data: Point[];
  series: Series[];
  format: (v: number) => string;
  labelFormat: (l: string) => string;
  labelTitle: string;
}) {
  return (
    <div className="max-h-[320px] overflow-auto scrollbar-thin px-5 pb-4">
      <table className="w-full text-[13px] tabular">
        <thead className="sticky top-0 bg-card">
          <tr className="text-left text-muted border-b border-line">
            <th className="py-2 pr-4 font-medium">{labelTitle}</th>
            {series.map((s) => (
              <th key={s.key} className="py-2 pr-4 font-medium text-right">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.date} className="border-b border-hair">
              <td className="py-1.5 pr-4 text-sub whitespace-nowrap">{labelFormat(p.date)}</td>
              {series.map((s) => (
                <td key={s.key} className="py-1.5 pr-4 text-right text-ink">
                  {p[s.key] == null ? "—" : format(Math.abs(p[s.key]))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  actions,
  data,
  series,
  format = (v) => fmtNum(v),
  labelFormat = fmtDayLong,
  labelTitle = "Дата",
  children,
  footer,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  data: Point[];
  series: Series[];
  format?: (v: number) => string;
  labelFormat?: (l: string) => string;
  labelTitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const [table, setTable] = useState(false);
  const hasData = data.some((p) => series.some((s) => p[s.key] != null));
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {actions}
            <button
              onClick={() => setTable((t) => !t)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-sub hover:text-ink hover:bg-page"
              title={table ? "Показать график" : "Показать таблицей"}
            >
              {table ? <IconChart width={14} height={14} /> : <IconTable width={14} height={14} />}
              {table ? "График" : "Таблица"}
            </button>
          </>
        }
      />
      {!hasData ? (
        <div className="px-5 pb-6 pt-8 text-center text-sm text-muted h-[200px]">Нет данных за этот период</div>
      ) : table ? (
        <DataTable data={data} series={series} format={format} labelFormat={labelFormat} labelTitle={labelTitle} />
      ) : (
        <>
          <Legend series={series} />
          <div className="px-2 pb-3">{children}</div>
        </>
      )}
      {footer}
    </Card>
  );
}

export function TimeChart({
  data,
  series,
  kind = "line",
  height = 260,
  format = (v) => fmtNum(v),
  stacked = false,
  connectNulls = false,
  domain,
  axisFormat = fmtAxis,
}: {
  data: Point[];
  series: Series[];
  kind?: "line" | "bar" | "area";
  height?: number;
  format?: (v: number) => string;
  stacked?: boolean;
  connectNulls?: boolean;
  domain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"];
  axisFormat?: (v: number) => string;
}) {
  const tooltip = (
    <Tooltip
      cursor={kind === "bar" ? { fill: "rgba(42,120,214,0.06)" } : { stroke: AXIS, strokeWidth: 1 }}
      content={<TooltipBox series={series} format={format} labelFormat={fmtDayLong} />}
    />
  );
  const common = (
    <>
      <CartesianGrid vertical={false} stroke={GRID} />
      <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={28} {...axisProps} />
      <YAxis tickFormatter={axisFormat} width={60} allowDecimals={false} domain={domain} {...axisProps} />
      {tooltip}
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === "bar" ? (
        <BarChart data={data} barGap={2} barCategoryGap="20%">
          {common}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              maxBarSize={24}
              stackId={stacked ? "a" : undefined}
              radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
              stroke={stacked ? "#ffffff" : undefined}
              strokeWidth={stacked ? 1 : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      ) : kind === "area" ? (
        <AreaChart data={data}>
          {common}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={s.color}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={data}>
          {common}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
              connectNulls={connectNulls}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

// Подписались вверх, отписались вниз от нулевой линии
export function FollowsChart({ data, height = 200 }: { data: Point[]; height?: number }) {
  const series: Series[] = [
    { key: "follows", label: "Подписались", color: SERIES[0] },
    { key: "unfollowsNeg", label: "Отписались", color: NEGATIVE },
  ];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} stackOffset="sign" barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={28} {...axisProps} />
        <YAxis tickFormatter={(v) => fmtAxis(Math.abs(v))} width={60} allowDecimals={false} {...axisProps} />
        <ReferenceLine y={0} stroke="#c3c7ce" />
        <Tooltip
          cursor={{ fill: "rgba(42,120,214,0.06)" }}
          content={<TooltipBox series={series} format={(v) => fmtNum(v)} labelFormat={fmtDayLong} />}
        />
        <Bar dataKey="follows" stackId="f" fill={SERIES[0]} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="unfollowsNeg" stackId="f" fill={NEGATIVE} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export const FOLLOWS_SERIES: Series[] = [
  { key: "follows", label: "Подписались", color: SERIES[0] },
  { key: "unfollowsNeg", label: "Отписались", color: NEGATIVE },
];

// Столбцы по категориям (дни недели, время суток): один ряд, один цвет
export function CategoryChart({
  data,
  valueKey,
  label,
  format,
  height = 200,
}: {
  data: { label: string; [k: string]: any }[];
  valueKey: string;
  label: string;
  format: (v: number) => string;
  height?: number;
}) {
  const series: Series[] = [{ key: valueKey, label, color: SERIES[0] }];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data.map((d) => ({ ...d, date: d.label }))} barCategoryGap="25%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" {...axisProps} interval={0} />
        <YAxis tickFormatter={(v) => format(v)} width={60} {...axisProps} />
        <Tooltip
          cursor={{ fill: "rgba(42,120,214,0.06)" }}
          content={<TooltipBox series={series} format={format} labelFormat={(l) => l} />}
        />
        <Bar dataKey={valueKey} fill={SERIES[0]} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Горизонтальные полосы с подписями: аудитория, типы контента
export function BarList({
  items,
  format = (v) => fmtNum(v),
  total,
  color = SERIES[0],
}: {
  items: { label: string; value: number; extra?: string }[];
  format?: (v: number) => string;
  total?: number;
  color?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const sum = total ?? items.reduce((a, i) => a + i.value, 0);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-ink truncate">{i.label}</span>
            <span className="text-sub tabular whitespace-nowrap">
              {format(i.value)}
              {sum > 0 && <span className="text-muted"> · {fmtNum((i.value / sum) * 100, 1)}%</span>}
              {i.extra && <span className="text-muted"> · {i.extra}</span>}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-hair overflow-hidden">
            <div className={cx("h-full rounded-full")} style={{ width: `${(i.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
