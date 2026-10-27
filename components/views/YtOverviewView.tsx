"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { YtDaily, YtStatsSummary, YtVideo } from "@/lib/types";
import { addDays, dateInTz, LOCAL_TZ } from "@/lib/dates";
import { countryName, fmtCompact, fmtNum, fmtPct, fmtRange, fmtSigned, plural } from "@/lib/format";
import { fmtClock, periodVideos, statsByType, summarizeYt, ytBestTime, ytEr, ytSeries } from "@/lib/ytmetrics";
import { useApi } from "../useApi";
import { Avatar, Card, CardHeader, Delta, Empty, ErrorNote, KpiTile, Segmented, Thumb, cx } from "../ui";
import { BarList, CategoryChart, ChartCard, FOLLOWS_SERIES, FollowsChart, SERIES, TimeChart } from "../charts";
import { IconExternal, IconInfo } from "../icons";

type StatsResp = { rows: YtDaily[]; prevFrom: string; prevTo: string; summary: { date: string; data: YtStatsSummary } | null };
type DayMetric = "views" | "watchHours" | "impressions" | "ctr";
const DAY: Record<DayMetric, { label: string; format: (v: number) => string; kind: "bar" | "line" }> = {
  views: { label: "Просмотры", format: (v) => fmtNum(v), kind: "bar" },
  watchHours: { label: "Время просмотра, ч", format: (v) => fmtNum(v, 1), kind: "bar" },
  impressions: { label: "Показы обложек", format: (v) => fmtNum(v), kind: "bar" },
  ctr: { label: "CTR обложек", format: (v) => fmtPct(v, 2), kind: "line" },
};

export function YtOverviewView({ ctx, onOpenVideo, onOpenSettings }: { ctx: Ctx; onOpenVideo: (id: string) => void; onOpenSettings: () => void }) {
  const ch = ctx.ytChannel!;
  const q = `channel=${ch.id}&from=${ctx.from}&to=${ctx.to}`;
  const stats = useApi<StatsResp>(`/api/yt/stats?${q}`);
  const videos = useApi<{ videos: YtVideo[] }>(`/api/yt/videos?${q}`);
  const today = dateInTz(new Date(), LOCAL_TZ);
  const history = useApi<{ videos: YtVideo[] }>(`/api/yt/videos?channel=${ch.id}&from=${addDays(today, -179)}&to=${today}`);
  const [metric, setMetric] = useState<DayMetric>("views");

  const rows = stats.data?.rows || [];
  const all = videos.data?.videos || [];
  const cur = useMemo(() => summarizeYt(rows, all, ctx.from, ctx.to, ch.subscribers), [rows, all, ctx.from, ctx.to, ch.subscribers]);
  const prev = useMemo(
    () => (stats.data ? summarizeYt(rows, all, stats.data.prevFrom, stats.data.prevTo, ch.subscribers) : null),
    [rows, all, stats.data, ch.subscribers]
  );
  const series = useMemo(() => ytSeries(rows, all, ctx.from, ctx.to), [rows, all, ctx.from, ctx.to]);
  const hasAnalytics = rows.some((r) => r.views != null);
  const hasReach = rows.some((r) => r.impressions != null);
  const summary = stats.data?.summary?.data || null;
  const inPeriod = periodVideos(all, ctx.from, ctx.to);
  const top = [...inPeriod].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8);
  const types = statsByType(inPeriod);
  const times = useMemo(() => ytBestTime(history.data?.videos || []), [history.data]);
  const historyCount = history.data?.videos.length || 0;

  if (stats.error) return <ErrorNote error={stats.error} />;
  if (videos.error) return <ErrorNote error={videos.error} />;

  const genders = summary
    ? Object.entries(
        summary.ageGender.reduce<Record<string, number>>((a, r) => ({ ...a, [r.gender]: (a[r.gender] || 0) + Number(r.percent) }), {})
      ).map(([g, v]) => ({ label: g === "female" ? "Женщины" : g === "male" ? "Мужчины" : "Не указан", value: Math.round(v * 10) / 10 }))
    : [];
  const ages = summary
    ? Object.entries(summary.ageGender.reduce<Record<string, number>>((a, r) => ({ ...a, [r.age]: (a[r.age] || 0) + Number(r.percent) }), {}))
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([age, v]) => ({ label: age, value: Math.round(v * 10) / 10 }))
    : [];

  return (
    <div className={cx("space-y-5 transition-opacity", (stats.loading || videos.loading) && stats.data && "opacity-60")}>
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar account={{ avatar_url: ch.avatar_url, display_name: ch.title, username: ch.handle || "" }} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-lg font-semibold text-ink">{ch.title}</h2>
              <span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-medium", ch.is_own ? "bg-accent-soft text-accent" : "bg-page text-sub")}>
                {ch.is_own ? "Свой канал" : "Конкурент"}
              </span>
              <a
                href={ch.handle ? `https://www.youtube.com/@${ch.handle}` : `https://www.youtube.com/channel/${ch.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
              >
                {ch.handle ? `@${ch.handle}` : "Открыть канал"}
                <IconExternal width={13} height={13} />
              </a>
            </div>
            {ch.description && <p className="mt-1 text-sm text-sub line-clamp-2 whitespace-pre-line">{ch.description}</p>}
          </div>
          <div className="flex gap-6 text-center">
            {[
              ["Подписчики", fmtNum(ch.subscribers)],
              ["Просмотры", fmtCompact(ch.views_total)],
              ["Видео", fmtNum(ch.videos_total)],
            ].map(([label, v]) => (
              <div key={label}>
                <div className="text-lg font-semibold text-ink">{v}</div>
                <div className="text-xs text-muted">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {ch.is_own && !ch.analytics_linked && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-[13px] text-sub">
          <IconInfo className="shrink-0 text-accent" width={16} height={16} />
          <p className="min-w-0 flex-1">
            Подключите аналитику: появятся время просмотра, досмотр, подписки и отписки, источники трафика, аудитория, показы и CTR
            обложек.
          </p>
          <button onClick={onOpenSettings} className="text-accent underline">
            В настройки
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label="Подписчики"
          value={fmtNum(cur.subsEnd)}
          sub={cur.subsDelta != null ? `${fmtSigned(cur.subsDelta)} за период` : "история копится с подключения"}
          delta={<Delta cur={cur.subsEnd} prev={cur.subsStart} />}
          hint="Публичное число подписчиков Google округляет до трёх значащих цифр (12 345 → 12 300)"
        />
        {hasAnalytics ? (
          <KpiTile
            label="Подписки / отписки"
            value={
              <span>
                <span className="text-up">+{fmtNum(cur.subsGained)}</span>
                <span className="text-muted font-normal"> / </span>
                <span className="text-down">−{fmtNum(cur.subsLost)}</span>
              </span>
            }
          />
        ) : (
          <KpiTile
            label="Просмотры канала"
            value={fmtCompact(cur.viewsByCounter)}
            hint="Насколько вырос общий счётчик просмотров канала за период, по замерам сайта"
          />
        )}
        {hasAnalytics && (
          <KpiTile label="Просмотры канала" value={fmtCompact(cur.views)} delta={<Delta cur={cur.views} prev={prev?.views} />} hint="По аналитике YouTube, все видео канала" />
        )}
        {hasAnalytics && (
          <KpiTile label="Время просмотра" value={`${fmtNum(cur.watchHours, 0)} ч`} delta={<Delta cur={cur.watchHours} prev={prev?.watchHours} />} />
        )}
        {hasAnalytics && (
          <KpiTile
            label="Средний просмотр"
            value={fmtClock(cur.avgViewDuration)}
            sub={cur.avgViewPercentage != null ? `досмотр ${fmtPct(cur.avgViewPercentage, 1)}` : undefined}
            delta={<Delta cur={cur.avgViewPercentage} prev={prev?.avgViewPercentage} mode="pp" />}
            hint="Средняя длительность просмотра и средний процент досмотра видео"
          />
        )}
        {hasReach && (
          <KpiTile
            label="Показы обложек"
            value={fmtCompact(cur.impressions)}
            sub={cur.ctr != null ? `CTR ${fmtPct(cur.ctr, 2)}` : undefined}
            delta={<Delta cur={cur.impressions} prev={prev?.impressions} />}
            hint="Сколько раз YouTube показал обложки видео и какая доля показов закончилась просмотром"
          />
        )}
        <KpiTile
          label="Видео за период"
          value={fmtNum(cur.videos)}
          sub={`${cur.long} ${plural(cur.long, "видео", "видео", "видео")} · ${cur.shorts} Shorts`}
          delta={<Delta cur={cur.videos} prev={prev?.videos} />}
        />
        <KpiTile label="Средние просмотры" value={fmtNum(cur.videoViewsAvg)} delta={<Delta cur={cur.videoViewsAvg} prev={prev?.videoViewsAvg} />} hint="Среднее число просмотров видео, вышедших за период" />
        <KpiTile
          label="За 24 часа / 7 дней"
          value={`${fmtNum(cur.views24Avg)} / ${fmtNum(cur.views7dAvg)}`}
          hint="Сколько просмотров видео набирает за первые сутки и первую неделю. Сутки сайт считает по своим замерам, для видео до подключения их нет. Неделю для своего канала с подключённой аналитикой берёт из YouTube Analytics"
        />
        <KpiTile label="ER" value={fmtPct(cur.er, 2)} delta={<Delta cur={cur.er} prev={prev?.er} mode="pp" />} hint="(Лайки + комментарии) / просмотры, среднее по видео периода" />
        <KpiTile label="View rate" value={fmtPct(cur.viewRate, 1)} delta={<Delta cur={cur.viewRate} prev={prev?.viewRate} mode="pp" />} hint="Просмотры видео / подписчики, среднее по видео периода" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Подписчики" subtitle="Число подписчиков на конец дня" data={series} series={[{ key: "subscribers", label: "Подписчики", color: SERIES[0] }]}>
          <TimeChart data={series} series={[{ key: "subscribers", label: "Подписчики", color: SERIES[0] }]} connectNulls domain={["auto", "auto"]} />
        </ChartCard>
        {hasAnalytics ? (
          <ChartCard title="Подписки и отписки" subtitle="По аналитике YouTube" data={series} series={FOLLOWS_SERIES}>
            <FollowsChart data={series} height={260} />
          </ChartCard>
        ) : (
          <ChartCard
            title="Просмотры видео по дню публикации"
            subtitle="Сумма текущих просмотров видео, вышедших в этот день"
            data={series}
            series={[{ key: "postViews", label: "Просмотры", color: SERIES[0] }]}
          >
            <TimeChart data={series} series={[{ key: "postViews", label: "Просмотры", color: SERIES[0] }]} kind="bar" />
          </ChartCard>
        )}
      </div>

      {hasAnalytics && (
        <ChartCard
          title={DAY[metric].label}
          subtitle="По аналитике YouTube. Последние 2–3 дня YouTube дорабатывает, поэтому они пустые"
          data={series}
          series={[{ key: metric, label: DAY[metric].label, color: SERIES[0] }]}
          format={DAY[metric].format}
          actions={
            <Segmented
              size="sm"
              value={metric}
              onChange={setMetric}
              options={(Object.keys(DAY) as DayMetric[])
                .filter((k) => hasReach || (k !== "impressions" && k !== "ctr"))
                .map((k) => ({ value: k, label: DAY[k].label }))}
            />
          }
        >
          <TimeChart
            data={series}
            series={[{ key: metric, label: DAY[metric].label, color: SERIES[0] }]}
            kind={DAY[metric].kind}
            format={DAY[metric].format}
            axisFormat={metric === "ctr" ? (v) => fmtPct(v, 1) : undefined}
          />
        </ChartCard>
      )}

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Видео и Shorts" subtitle="Средние показатели за период" />
          {types.length === 0 ? (
            <Empty title="За период нет видео" />
          ) : (
            <div className="overflow-x-auto px-5 pb-4">
              <table className="w-full text-[13px] tabular">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-2 pr-3 font-medium">Тип</th>
                    <th className="py-2 pr-3 text-right font-medium">Шт.</th>
                    <th className="py-2 pr-3 text-right font-medium">Просмотры</th>
                    <th className="py-2 pr-3 text-right font-medium">ER</th>
                    <th className="py-2 pr-3 text-right font-medium">Длина</th>
                    <th className="py-2 text-right font-medium">Досмотр</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.label} className="border-b border-hair">
                      <td className="py-2 pr-3 text-ink">{t.label}</td>
                      <td className="py-2 pr-3 text-right">{t.count}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(t.viewsAvg)}</td>
                      <td className="py-2 pr-3 text-right">{fmtPct(t.erAvg, 2)}</td>
                      <td className="py-2 pr-3 text-right">{fmtClock(t.durationAvg)}</td>
                      <td className="py-2 text-right">{fmtPct(t.retentionAvg, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Лучшие видео периода" subtitle="По просмотрам" />
          {top.length === 0 ? (
            <Empty title="За период нет видео" />
          ) : (
            <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-4">
              {top.map((v) => (
                <button key={v.id} onClick={() => onOpenVideo(v.id)} className="group text-left">
                  <div className="relative overflow-hidden rounded-lg">
                    <Thumb src={v.thumb_url} className="aspect-video w-full transition group-hover:scale-[1.02]" />
                    {v.is_short && <span className="absolute left-1.5 top-1.5 rounded bg-ink/75 px-1.5 py-0.5 text-[10px] font-medium text-white">Shorts</span>}
                  </div>
                  <p className="mt-1.5 text-xs leading-snug text-ink line-clamp-2">{v.title}</p>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-ink">{fmtNum(v.views)}</span>
                    <span className="text-muted">ER {fmtPct(ytEr(v), 1)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {summary && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardHeader title="Источники трафика" subtitle={`Просмотры за ${fmtRange(summary.period.from, summary.period.to)}`} />
            <div className="px-5 pb-5">
              {summary.traffic.length ? <BarList items={summary.traffic.slice(0, 8).map((t) => ({ label: t.name, value: t.views }))} /> : <p className="text-sm text-muted">Нет данных</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Аудитория" subtitle={`Доля просмотров за ${fmtRange(summary.period.from, summary.period.to)}, %`} />
            <div className="space-y-5 px-5 pb-5">
              {genders.length ? <BarList items={genders} format={(v) => fmtPct(v, 1)} share={false} /> : <p className="text-sm text-muted">YouTube не показывает пол и возраст для маленьких каналов</p>}
              {ages.length > 0 && <BarList items={ages} format={(v) => fmtPct(v, 1)} share={false} />}
            </div>
          </Card>
          <Card>
            <CardHeader title="Страны и устройства" subtitle={`Просмотры за ${fmtRange(summary.period.from, summary.period.to)}`} />
            <div className="space-y-5 px-5 pb-5">
              {summary.countries.length ? (
                <BarList items={summary.countries.slice(0, 6).map((c) => ({ label: countryName(c.code), value: c.views }))} />
              ) : (
                <p className="text-sm text-muted">Нет данных</p>
              )}
              {summary.devices.length > 0 && <BarList items={summary.devices.map((d) => ({ label: d.name, value: d.views }))} />}
              {summary.subscribed.length > 0 && <BarList items={summary.subscribed.map((d) => ({ label: d.name, value: d.views }))} />}
            </div>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader
          title="Лучшее время для публикаций"
          subtitle={
            historyCount >= 5
              ? `Средние просмотры видео по дню и времени выхода, московское время. Основано на ${historyCount} видео за 180 дней`
              : "Нужно хотя бы 5 видео за последние 180 дней"
          }
        />
        {historyCount >= 5 && (
          <div className="grid gap-4 px-3 pb-4 md:grid-cols-2">
            <div>
              <p className="px-2 pb-1 text-[13px] text-sub">По дням недели</p>
              <CategoryChart data={times.byWeekday} valueKey="viewsAvg" label="Средние просмотры" format={(v) => fmtNum(v)} />
              <p className="px-2 text-xs text-muted">Видео: {times.byWeekday.map((s) => `${s.label} ${s.count}`).join(" · ")}</p>
            </div>
            <div>
              <p className="px-2 pb-1 text-[13px] text-sub">По времени выхода</p>
              <CategoryChart data={times.byHour} valueKey="viewsAvg" label="Средние просмотры" format={(v) => fmtNum(v)} />
              <p className="px-2 text-xs text-muted">Видео: {times.byHour.map((s) => `${s.label} ${s.count}`).join(" · ")}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
