"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { TgDaily, TgPost } from "@/lib/types";
import { dateRange } from "@/lib/dates";
import { fmtNum, fmtPct, fmtSigned } from "@/lib/format";
import { summarizeTg, viewsByPublishDay, type TgSummaryCalc } from "@/lib/tgmetrics";
import { useApi } from "../useApi";
import { Avatar, Card, CardHeader, Delta, Empty, ErrorNote, Segmented, cx } from "../ui";
import { ChartCard, TimeChart, type Series } from "../charts";

type Metric = "growth" | "postViews";

export function TgCompareView({ ctx, onOpenChannel }: { ctx: Ctx; onOpenChannel: (id: string) => void }) {
  const q = `channel=all&from=${ctx.from}&to=${ctx.to}`;
  const stats = useApi<{ rows: TgDaily[]; prevFrom: string; prevTo: string }>(`/api/tg/stats?${q}`);
  const posts = useApi<{ posts: TgPost[] }>(`/api/tg/posts?${q}`);
  const [metric, setMetric] = useState<Metric>("growth");

  const table = useMemo(() => {
    if (!stats.data) return [];
    return ctx.tgChannels.map((ch) => {
      const rows = stats.data!.rows.filter((r) => r.channel_id === ch.id);
      const ps = (posts.data?.posts || []).filter((p) => p.channel_id === ch.id);
      return {
        ch,
        rows,
        posts: ps,
        cur: summarizeTg(rows, ps, ctx.from, ctx.to, ch.subscribers),
        prev: summarizeTg(rows, ps, stats.data!.prevFrom, stats.data!.prevTo, ch.subscribers),
      };
    });
  }, [stats.data, posts.data, ctx.tgChannels, ctx.from, ctx.to]);

  const chart = useMemo(() => {
    const dates = dateRange(ctx.from, ctx.to);
    const pv = new Map(table.map((t) => [t.ch.id, viewsByPublishDay(t.posts, ctx.from, ctx.to)]));
    return dates.map((date, i) => {
      const point: Record<string, any> = { date };
      for (const t of table) {
        if (metric === "growth") {
          const base = t.cur.subsStart;
          const v = t.rows.find((r) => r.date === date)?.subscribers ?? null;
          point[t.ch.id] = base && v != null ? ((v - base) / base) * 100 : null;
        } else {
          point[t.ch.id] = pv.get(t.ch.id)?.[i].postViews ?? null;
        }
      }
      return point as { date: string };
    });
  }, [table, metric, ctx.from, ctx.to]);

  const series: Series[] = ctx.tgChannels.map((c) => ({ key: c.id, label: c.title, color: ctx.tgColorFor(c.id) }));

  if (stats.error) return <ErrorNote error={stats.error} />;
  if (ctx.tgChannels.length === 0) {
    return (
      <Card>
        <Empty title="Каналы не подключены">Добавьте свои каналы и конкурентов в разделе «Настройки».</Empty>
      </Card>
    );
  }

  const cols: { label: string; render: (c: TgSummaryCalc, p: TgSummaryCalc) => React.ReactNode }[] = [
    { label: "Подписчики", render: (c) => fmtNum(c.subsEnd) },
    {
      label: "Прирост",
      render: (c) => (
        <span className={cx(c.subsDelta != null && c.subsDelta > 0 && "text-up", c.subsDelta != null && c.subsDelta < 0 && "text-down")}>
          {fmtSigned(c.subsDelta)}
        </span>
      ),
    },
    { label: "Постов", render: (c, p) => <Cell v={fmtNum(c.posts)} d={<Delta cur={c.posts} prev={p.posts} emptyText="" />} /> },
    { label: "Охват поста", render: (c, p) => <Cell v={fmtNum(c.viewsAvg)} d={<Delta cur={c.viewsAvg} prev={p.viewsAvg} emptyText="" />} /> },
    { label: "За 24 ч", render: (c, p) => <Cell v={fmtNum(c.views24Avg)} d={<Delta cur={c.views24Avg} prev={p.views24Avg} emptyText="" />} /> },
    { label: "ERR", render: (c, p) => <Cell v={fmtPct(c.err, 1)} d={<Delta cur={c.err} prev={p.err} mode="pp" emptyText="" />} /> },
    { label: "ER", render: (c, p) => <Cell v={fmtPct(c.er, 2)} d={<Delta cur={c.er} prev={p.er} mode="pp" emptyText="" />} /> },
    { label: "Реакции", render: (c, p) => <Cell v={fmtNum(c.reactions)} d={<Delta cur={c.reactions} prev={p.reactions} emptyText="" />} /> },
    { label: "Репосты", render: (c, p) => <Cell v={fmtNum(c.forwards)} d={<Delta cur={c.forwards} prev={p.forwards} emptyText="" />} /> },
  ];

  return (
    <div className={cx("space-y-5 transition-opacity", stats.loading && stats.data && "opacity-60")}>
      <Card>
        <CardHeader title="Каналы за период" subtitle="Свои каналы и конкуренты. Под значением: изменение к предыдущему периоду" />
        <div className="overflow-x-auto scrollbar-thin pb-2">
          <table className="w-full text-[13px] tabular">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2.5 pl-5 pr-3 font-medium">Канал</th>
                {cols.map((c) => (
                  <th key={c.label} className="py-2.5 pr-4 text-right font-medium whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((t) => (
                <tr key={t.ch.id} className="border-b border-hair align-top">
                  <td className="py-3 pl-5 pr-3">
                    <button onClick={() => onOpenChannel(t.ch.id)} className="flex items-center gap-2.5 text-left hover:underline">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ctx.tgColorFor(t.ch.id) }} />
                      <Avatar account={{ avatar_url: t.ch.avatar_url, display_name: t.ch.title, username: t.ch.username || "" }} size={28} />
                      <span className="min-w-0">
                        <span className="block whitespace-nowrap font-medium text-ink">{t.ch.title}</span>
                        <span className="block text-xs text-muted">{t.ch.is_own ? "свой" : "конкурент"}{t.ch.username ? ` · @${t.ch.username}` : ""}</span>
                      </span>
                    </button>
                  </td>
                  {cols.map((c) => (
                    <td key={c.label} className="py-3 pr-4 text-right whitespace-nowrap">
                      {c.render(t.cur, t.prev)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ChartCard
        title={metric === "growth" ? "Прирост подписчиков" : "Просмотры постов по дню публикации"}
        subtitle={
          metric === "growth"
            ? "Изменение числа подписчиков с начала периода, в процентах. У конкурентов история начинается с дня подключения"
            : "Сумма просмотров постов, вышедших в этот день"
        }
        data={chart}
        series={series}
        format={metric === "growth" ? (v) => fmtPct(v, 1) : (v) => fmtNum(v)}
        actions={
          <Segmented
            size="sm"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "growth", label: "Прирост" },
              { value: "postViews", label: "Просмотры постов" },
            ]}
          />
        }
      >
        <TimeChart
          data={chart}
          series={series}
          height={300}
          format={metric === "growth" ? (v) => fmtPct(v, 1) : (v) => fmtNum(v)}
          axisFormat={metric === "growth" ? (v) => fmtPct(v, 0) : undefined}
          connectNulls={metric === "growth"}
          kind={metric === "growth" ? "line" : "bar"}
        />
      </ChartCard>
    </div>
  );
}

function Cell({ v, d }: { v: React.ReactNode; d: React.ReactNode }) {
  return (
    <div>
      <div className="text-ink">{v}</div>
      <div className="mt-0.5">{d}</div>
    </div>
  );
}
