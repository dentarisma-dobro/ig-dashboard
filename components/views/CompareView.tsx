"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { DailyRow, Post } from "@/lib/types";
import { dateRange } from "@/lib/dates";
import { fmtCompact, fmtNum, fmtPct, fmtSigned } from "@/lib/format";
import { followersOn, summarize, type Summary } from "@/lib/metrics";
import { useApi } from "../useApi";
import { Avatar, Card, CardHeader, Delta, ErrorNote, Segmented, cx } from "../ui";
import { ChartCard, TimeChart, type Series } from "../charts";

type Metric = "growth" | "reach" | "views" | "profile_views";

const METRICS: Record<Metric, { label: string; subtitle: string; format: (v: number) => string }> = {
  growth: {
    label: "Прирост подписчиков",
    subtitle: "Изменение числа подписчиков с начала периода, в процентах: так аккаунты разного размера видны на одной шкале",
    format: (v) => fmtPct(v, 1),
  },
  reach: { label: "Охват", subtitle: "Охват аккаунта по дням", format: (v) => fmtNum(v) },
  views: { label: "Просмотры", subtitle: "Просмотры контента по дням", format: (v) => fmtNum(v) },
  profile_views: { label: "Посещения профиля", subtitle: "Посещения профиля по дням", format: (v) => fmtNum(v) },
};

export function CompareView({ ctx, onOpenAccount }: { ctx: Ctx; onOpenAccount: (id: string) => void }) {
  const q = `account=all&from=${ctx.from}&to=${ctx.to}`;
  const stats = useApi<{ rows: DailyRow[]; prevFrom: string; prevTo: string }>(`/api/stats?${q}`);
  const posts = useApi<{ posts: Post[] }>(`/api/posts?${q}`);
  const [metric, setMetric] = useState<Metric>("growth");

  const table = useMemo(() => {
    if (!stats.data) return [];
    return ctx.accounts.map((a) => {
      const rows = stats.data!.rows.filter((r) => r.account_id === a.id);
      const ps = (posts.data?.posts || []).filter((p) => p.account_id === a.id);
      const cur = summarize(rows, ps, ctx.from, ctx.to, a.followers_count);
      const prev = summarize(rows, ps, stats.data!.prevFrom, stats.data!.prevTo, a.followers_count);
      return { account: a, cur, prev, rows };
    });
  }, [stats.data, posts.data, ctx.accounts, ctx.from, ctx.to]);

  const chart = useMemo(() => {
    const dates = dateRange(ctx.from, ctx.to);
    return dates.map((date) => {
      const point: Record<string, any> = { date };
      for (const t of table) {
        if (metric === "growth") {
          const base = t.cur.followersStart;
          const v = followersOn(t.rows, date);
          point[t.account.id] = base && v != null ? ((v - base) / base) * 100 : null;
        } else {
          const r = t.rows.find((x) => x.date === date);
          point[t.account.id] = r ? (r[metric] as number | null) : null;
        }
      }
      return point as { date: string };
    });
  }, [table, metric, ctx.from, ctx.to]);

  const series: Series[] = ctx.accounts.map((a) => ({ key: a.id, label: a.display_name, color: ctx.colorFor(a.id) }));

  if (stats.error) return <ErrorNote error={stats.error} />;

  const cols: { label: string; render: (c: Summary, p: Summary) => React.ReactNode }[] = [
    { label: "Подписчики", render: (c) => fmtNum(c.followersEnd) },
    {
      label: "Прирост",
      render: (c) => (
        <span className={cx(c.followersDelta != null && c.followersDelta > 0 && "text-up", c.followersDelta != null && c.followersDelta < 0 && "text-down")}>
          {fmtSigned(c.followersDelta)}
        </span>
      ),
    },
    { label: "Охват в день", render: (c, p) => <Cell v={fmtNum(c.reachAvg)} d={<Delta cur={c.reachAvg} prev={p.reachAvg} emptyText="" />} /> },
    { label: "Просмотры", render: (c, p) => <Cell v={fmtCompact(c.viewsSum)} d={<Delta cur={c.viewsSum} prev={p.viewsSum} emptyText="" />} /> },
    { label: "Посещения профиля", render: (c, p) => <Cell v={fmtNum(c.profileViewsSum)} d={<Delta cur={c.profileViewsSum} prev={p.profileViewsSum} emptyText="" />} /> },
    { label: "Публикации", render: (c, p) => <Cell v={fmtNum(c.posts)} d={<Delta cur={c.posts} prev={p.posts} emptyText="" />} /> },
    { label: "Охват публикации", render: (c, p) => <Cell v={fmtNum(c.postsReachAvg)} d={<Delta cur={c.postsReachAvg} prev={p.postsReachAvg} emptyText="" />} /> },
    { label: "ER", render: (c, p) => <Cell v={fmtPct(c.er, 2)} d={<Delta cur={c.er} prev={p.er} mode="pp" emptyText="" />} /> },
    { label: "ERR", render: (c, p) => <Cell v={fmtPct(c.err, 2)} d={<Delta cur={c.err} prev={p.err} mode="pp" emptyText="" />} /> },
  ];

  return (
    <div className={cx("space-y-5 transition-opacity", stats.loading && stats.data && "opacity-60")}>
      <Card>
        <CardHeader title="Аккаунты за период" subtitle="Под значением: изменение к такому же предыдущему периоду" />
        <div className="overflow-x-auto scrollbar-thin pb-2">
          <table className="w-full text-[13px] tabular">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2.5 pl-5 pr-3 font-medium">Аккаунт</th>
                {cols.map((c) => (
                  <th key={c.label} className="py-2.5 pr-4 text-right font-medium whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((t) => (
                <tr key={t.account.id} className="border-b border-hair align-top">
                  <td className="py-3 pl-5 pr-3">
                    <button onClick={() => onOpenAccount(t.account.id)} className="flex items-center gap-2.5 text-left hover:underline">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ctx.colorFor(t.account.id) }} />
                      <Avatar account={t.account} size={28} />
                      <span className="min-w-0">
                        <span className="block whitespace-nowrap font-medium text-ink">{t.account.display_name}</span>
                        <span className="block text-xs text-muted">@{t.account.username}</span>
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
        title={METRICS[metric].label}
        subtitle={METRICS[metric].subtitle}
        data={chart}
        series={series}
        format={METRICS[metric].format}
        actions={
          <Segmented
            size="sm"
            value={metric}
            onChange={setMetric}
            options={(Object.keys(METRICS) as Metric[]).map((k) => ({ value: k, label: METRICS[k].label }))}
          />
        }
      >
        <TimeChart
          data={chart}
          series={series}
          format={METRICS[metric].format}
          axisFormat={metric === "growth" ? (v) => fmtPct(v, 0) : undefined}
          height={300}
          connectNulls={metric === "growth"}
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
