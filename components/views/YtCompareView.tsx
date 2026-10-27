"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { YtDaily, YtVideo } from "@/lib/types";
import { dateRange } from "@/lib/dates";
import { fmtCompact, fmtNum, fmtPct, fmtSigned } from "@/lib/format";
import { summarizeYt, type YtSummary } from "@/lib/ytmetrics";
import { useApi } from "../useApi";
import { Avatar, Card, CardHeader, Delta, Empty, ErrorNote, Segmented, cx } from "../ui";
import { ChartCard, TimeChart, type Series } from "../charts";

type Metric = "growth" | "counter";

export function YtCompareView({ ctx, onOpenChannel }: { ctx: Ctx; onOpenChannel: (id: string) => void }) {
  const q = `channel=all&from=${ctx.from}&to=${ctx.to}`;
  const stats = useApi<{ rows: YtDaily[]; prevFrom: string; prevTo: string }>(`/api/yt/stats?${q}`);
  const videos = useApi<{ videos: YtVideo[] }>(`/api/yt/videos?${q}`);
  const [metric, setMetric] = useState<Metric>("growth");

  const table = useMemo(() => {
    if (!stats.data) return [];
    return ctx.ytChannels.map((ch) => {
      const rows = stats.data!.rows.filter((r) => r.channel_id === ch.id);
      const vs = (videos.data?.videos || []).filter((v) => v.channel_id === ch.id);
      return {
        ch,
        rows,
        cur: summarizeYt(rows, vs, ctx.from, ctx.to, ch.subscribers),
        prev: summarizeYt(rows, vs, stats.data!.prevFrom, stats.data!.prevTo, ch.subscribers),
      };
    });
  }, [stats.data, videos.data, ctx.ytChannels, ctx.from, ctx.to]);

  const chart = useMemo(
    () =>
      dateRange(ctx.from, ctx.to).map((date) => {
        const point: Record<string, any> = { date };
        for (const t of table) {
          const r = t.rows.find((x) => x.date === date);
          if (metric === "growth") {
            const base = t.cur.subsStart;
            point[t.ch.id] = base && r?.subscribers != null ? ((r.subscribers - base) / base) * 100 : null;
          } else {
            // Прирост счётчика просмотров канала к предыдущему замеру
            const prevRow = [...t.rows].reverse().find((x) => x.date < date && x.views_total != null);
            point[t.ch.id] = r?.views_total != null && prevRow?.views_total != null ? Number(r.views_total) - Number(prevRow.views_total) : null;
          }
        }
        return point as { date: string };
      }),
    [table, metric, ctx.from, ctx.to]
  );

  const series: Series[] = ctx.ytChannels.map((c) => ({ key: c.id, label: c.title, color: ctx.ytColorFor(c.id) }));

  if (stats.error) return <ErrorNote error={stats.error} />;
  if (ctx.ytChannels.length === 0) {
    return (
      <Card>
        <Empty title="Каналы не подключены">Добавьте свои каналы и конкурентов в разделе «Настройки».</Empty>
      </Card>
    );
  }

  const cols: { label: string; render: (c: YtSummary, p: YtSummary) => React.ReactNode }[] = [
    { label: "Подписчики", render: (c) => fmtNum(c.subsEnd) },
    {
      label: "Прирост",
      render: (c) => (
        <span className={cx(c.subsDelta != null && c.subsDelta > 0 && "text-up", c.subsDelta != null && c.subsDelta < 0 && "text-down")}>{fmtSigned(c.subsDelta)}</span>
      ),
    },
    { label: "Просмотры канала", render: (c) => fmtCompact(c.views ?? c.viewsByCounter) },
    { label: "Видео", render: (c, p) => <Cell v={`${fmtNum(c.long)} + ${fmtNum(c.shorts)} Shorts`} d={<Delta cur={c.videos} prev={p.videos} emptyText="" />} /> },
    { label: "Ср. просмотры", render: (c, p) => <Cell v={fmtNum(c.videoViewsAvg)} d={<Delta cur={c.videoViewsAvg} prev={p.videoViewsAvg} emptyText="" />} /> },
    { label: "За 7 дней", render: (c, p) => <Cell v={fmtNum(c.views7dAvg)} d={<Delta cur={c.views7dAvg} prev={p.views7dAvg} emptyText="" />} /> },
    { label: "ER", render: (c, p) => <Cell v={fmtPct(c.er, 2)} d={<Delta cur={c.er} prev={p.er} mode="pp" emptyText="" />} /> },
    { label: "View rate", render: (c, p) => <Cell v={fmtPct(c.viewRate, 1)} d={<Delta cur={c.viewRate} prev={p.viewRate} mode="pp" emptyText="" />} /> },
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
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ctx.ytColorFor(t.ch.id) }} />
                      <Avatar account={{ avatar_url: t.ch.avatar_url, display_name: t.ch.title, username: t.ch.handle || "" }} size={28} />
                      <span className="min-w-0">
                        <span className="block whitespace-nowrap font-medium text-ink">{t.ch.title}</span>
                        <span className="block text-xs text-muted">
                          {t.ch.is_own ? "свой" : "конкурент"}
                          {t.ch.handle ? ` · @${t.ch.handle}` : ""}
                        </span>
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
        title={metric === "growth" ? "Прирост подписчиков" : "Просмотры канала по дням"}
        subtitle={
          metric === "growth"
            ? "Изменение числа подписчиков с начала периода, в процентах. История копится с дня подключения канала"
            : "Насколько вырос общий счётчик просмотров канала за день, по замерам сайта"
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
              { value: "counter", label: "Просмотры" },
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
          connectNulls
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
