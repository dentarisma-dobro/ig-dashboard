"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { TgDaily, TgPost, TgStatsSummary } from "@/lib/types";
import { addDays, dateInTz, LOCAL_TZ } from "@/lib/dates";
import { fmtCompact, fmtDateTime, fmtNum, fmtPct, fmtSigned, plural } from "@/lib/format";
import {
  periodPosts,
  summarizeTg,
  tgBestTime,
  tgPostErr,
  tgPostLink,
  tgSeries,
  tgSubsOn,
  TG_MEDIA_LABEL,
  viewsByPublishDay,
} from "@/lib/tgmetrics";
import { postDate } from "@/lib/metrics";
import { useApi } from "../useApi";
import { Avatar, Card, CardHeader, Delta, Empty, ErrorNote, KpiTile, Segmented, cx } from "../ui";
import { BarList, CategoryChart, ChartCard, FOLLOWS_SERIES, FollowsChart, SERIES, TimeChart } from "../charts";
import { IconExternal, IconInfo } from "../icons";

type StatsResp = { rows: TgDaily[]; prevFrom: string; prevTo: string; summary: { date: string; data: TgStatsSummary } | null };

export function TgOverviewView({ ctx, onOpenSettings }: { ctx: Ctx; onOpenSettings: () => void }) {
  const ch = ctx.tgChannel!;
  const q = `channel=${ch.id}&from=${ctx.from}&to=${ctx.to}`;
  const stats = useApi<StatsResp>(`/api/tg/stats?${q}`);
  const posts = useApi<{ posts: TgPost[] }>(`/api/tg/posts?${q}`);
  const last = dateInTz(new Date(), LOCAL_TZ);
  const history = useApi<{ posts: TgPost[] }>(`/api/tg/posts?channel=${ch.id}&from=${addDays(last, -179)}&to=${last}`);
  const [dayMetric, setDayMetric] = useState<"views" | "shares">("views");

  const rows = stats.data?.rows || [];
  const all = posts.data?.posts || [];
  const cur = useMemo(() => summarizeTg(rows, all, ctx.from, ctx.to, ch.subscribers), [rows, all, ctx.from, ctx.to, ch.subscribers]);
  const prev = useMemo(
    () => (stats.data ? summarizeTg(rows, all, stats.data.prevFrom, stats.data.prevTo, ch.subscribers) : null),
    [rows, all, stats.data, ch.subscribers]
  );
  const series = useMemo(() => {
    const base = tgSeries(rows, ctx.from, ctx.to);
    const pv = viewsByPublishDay(all, ctx.from, ctx.to);
    return base.map((p, i) => ({ ...p, postViews: pv[i].postViews }));
  }, [rows, all, ctx.from, ctx.to]);

  // У своих каналов есть встроенная статистика Telegram: подписки, отписки и просмотры по дням
  const ownStats = rows.some((r) => r.joined != null || r.views != null);
  const summary = stats.data?.summary?.data || null;
  const top = [...periodPosts(all, ctx.from, ctx.to)].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8);
  const times = useMemo(() => tgBestTime(history.data?.posts || []), [history.data]);
  const historyCount = history.data?.posts.length || 0;

  if (stats.error) return <ErrorNote error={stats.error} />;
  if (posts.error) return <ErrorNote error={posts.error} />;

  return (
    <div className={cx("space-y-5 transition-opacity", (stats.loading || posts.loading) && stats.data && "opacity-60")}>
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar account={{ avatar_url: ch.avatar_url, display_name: ch.title, username: ch.username || "" }} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-lg font-semibold text-ink">{ch.title}</h2>
              <span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-medium", ch.is_own ? "bg-accent-soft text-accent" : "bg-page text-sub")}>
                {ch.is_own ? "Свой канал" : "Конкурент"}
              </span>
              {ch.username && (
                <a href={`https://t.me/${ch.username}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                  @{ch.username}
                  <IconExternal width={13} height={13} />
                </a>
              )}
            </div>
            {ch.about && <p className="mt-1 text-sm text-sub line-clamp-2 whitespace-pre-line">{ch.about}</p>}
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-ink">{fmtNum(ch.subscribers)}</div>
            <div className="text-xs text-muted">подписчиков</div>
          </div>
        </div>
      </Card>

      {!ch.history_loaded && (
        <div className="flex gap-2.5 rounded-xl border border-line bg-card px-4 py-3 text-[13px] text-sub">
          <IconInfo className="mt-0.5 shrink-0 text-accent" width={16} height={16} />
          <p>
            Пока загружены только последние 100 постов. Старые посты подтянутся кнопкой «История» в{" "}
            <button onClick={onOpenSettings} className="text-accent underline">
              настройках
            </button>
            .
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label="Подписчики"
          value={fmtNum(cur.subsEnd)}
          sub={cur.subsDelta != null ? `${fmtSigned(cur.subsDelta)} за период` : "история копится с подключения"}
          delta={<Delta cur={cur.subsEnd} prev={cur.subsStart} />}
        />
        {ownStats ? (
          <KpiTile
            label="Подписки / отписки"
            value={
              cur.joined != null ? (
                <span>
                  <span className="text-up">+{fmtNum(cur.joined)}</span>
                  <span className="text-muted font-normal"> / </span>
                  <span className="text-down">−{fmtNum(cur.left)}</span>
                </span>
              ) : (
                "—"
              )
            }
            hint="Из встроенной статистики Telegram, есть только у своих каналов"
          />
        ) : (
          <KpiTile
            label="Постов в неделю"
            value={fmtNum(cur.postsPerDay != null ? cur.postsPerDay * 7 : null, 1)}
            delta={<Delta cur={cur.postsPerDay} prev={prev?.postsPerDay} />}
          />
        )}
        <KpiTile label="Публикации" value={fmtNum(cur.posts)} delta={<Delta cur={cur.posts} prev={prev?.posts} />} />
        <KpiTile
          label="Средний охват поста"
          value={fmtNum(cur.viewsAvg)}
          delta={<Delta cur={cur.viewsAvg} prev={prev?.viewsAvg} />}
          hint="Среднее число просмотров поста на сегодня"
        />
        <KpiTile
          label="Охват за 24 часа"
          value={fmtNum(cur.views24Avg)}
          delta={<Delta cur={cur.views24Avg} prev={prev?.views24Avg} />}
          hint="Сколько просмотров пост набирает за первые сутки. Сайт считает это по своим замерам, поэтому для постов до подключения канала значения нет"
        />
        <KpiTile
          label="ERR"
          value={fmtPct(cur.err, 1)}
          delta={<Delta cur={cur.err} prev={prev?.err} mode="pp" />}
          hint="Охват поста / подписчики. Какая доля подписчиков видит пост"
        />
        <KpiTile
          label="ERR24"
          value={fmtPct(cur.err24, 1)}
          delta={<Delta cur={cur.err24} prev={prev?.err24} mode="pp" />}
          hint="Охват за первые 24 часа / подписчики"
        />
        <KpiTile
          label="ER"
          value={fmtPct(cur.er, 2)}
          delta={<Delta cur={cur.er} prev={prev?.er} mode="pp" />}
          hint="(Реакции + репосты + комментарии) / просмотры поста. В режиме без ключей Telegram учитываются только реакции"
        />
        <KpiTile label="Реакции" value={fmtCompact(cur.reactions)} delta={<Delta cur={cur.reactions} prev={prev?.reactions} />} />
        <KpiTile label="Репосты" value={fmtCompact(cur.forwards)} delta={<Delta cur={cur.forwards} prev={prev?.forwards} />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Подписчики" subtitle="Число подписчиков на конец дня" data={series} series={[{ key: "subscribers", label: "Подписчики", color: SERIES[0] }]}>
          <TimeChart data={series} series={[{ key: "subscribers", label: "Подписчики", color: SERIES[0] }]} connectNulls domain={["auto", "auto"]} />
        </ChartCard>
        {ownStats ? (
          <ChartCard title="Подписки и отписки" subtitle="По встроенной статистике Telegram" data={series} series={FOLLOWS_SERIES}>
            <FollowsChart data={series} height={260} />
          </ChartCard>
        ) : (
          <ChartCard
            title="Просмотры постов по дню публикации"
            subtitle="Сумма текущих просмотров постов, вышедших в этот день"
            data={series}
            series={[{ key: "postViews", label: "Просмотры", color: SERIES[0] }]}
          >
            <TimeChart data={series} series={[{ key: "postViews", label: "Просмотры", color: SERIES[0] }]} kind="bar" />
          </ChartCard>
        )}
      </div>

      {ownStats && (
        <ChartCard
          title={dayMetric === "views" ? "Просмотры канала по дням" : "Репосты по дням"}
          subtitle="По встроенной статистике Telegram: все просмотры за день, включая старые посты"
          data={series}
          series={[{ key: dayMetric, label: dayMetric === "views" ? "Просмотры" : "Репосты", color: SERIES[0] }]}
          actions={
            <Segmented
              size="sm"
              value={dayMetric}
              onChange={setDayMetric}
              options={[
                { value: "views", label: "Просмотры" },
                { value: "shares", label: "Репосты" },
              ]}
            />
          }
        >
          <TimeChart
            data={series}
            series={[{ key: dayMetric, label: dayMetric === "views" ? "Просмотры" : "Репосты", color: SERIES[0] }]}
            kind="bar"
          />
        </ChartCard>
      )}

      {summary && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardHeader title="Уведомления" subtitle={`Статистика Telegram за ${summary.period.from} – ${summary.period.to}`} />
            <div className="px-5 pb-5">
              <div className="text-2xl font-semibold text-ink">{fmtPct(summary.notificationsPercent, 1)}</div>
              <p className="text-xs text-muted">подписчиков не отключили уведомления</p>
              <dl className="mt-4 space-y-1.5 text-[13px]">
                {[
                  ["Просмотров на пост", summary.viewsPerPost],
                  ["Репостов на пост", summary.sharesPerPost],
                  ["Реакций на пост", summary.reactionsPerPost],
                ].map(([label, v]: any) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="text-sub">{label}</dt>
                    <dd className="flex items-center gap-2">
                      <span className="font-medium text-ink">{fmtNum(v.current, 1)}</span>
                      <Delta cur={v.current} prev={v.previous} emptyText="" />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Card>
          <Card>
            <CardHeader title="Источники просмотров" />
            <div className="px-5 pb-5">
              {summary.viewsBySource.length ? (
                <BarList items={summary.viewsBySource.slice(0, 8).map((s) => ({ label: s.name, value: s.value }))} />
              ) : (
                <p className="text-sm text-muted">Нет данных</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Откуда приходят подписчики" />
            <div className="px-5 pb-5">
              {summary.followersBySource.length ? (
                <BarList items={summary.followersBySource.slice(0, 8).map((s) => ({ label: s.name, value: s.value }))} />
              ) : (
                <p className="text-sm text-muted">Нет данных</p>
              )}
              {summary.languages.length > 0 && (
                <>
                  <p className="mb-2 mt-5 text-[13px] font-medium text-ink">Языки подписчиков</p>
                  <BarList items={summary.languages.slice(0, 5).map((s) => ({ label: s.name, value: s.value }))} />
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader title="Лучшие посты периода" subtitle="По просмотрам" />
        {top.length === 0 ? (
          <Empty title="За период нет постов" />
        ) : (
          <ul className="divide-y divide-hair border-t border-line">
            {top.map((p) => {
              const link = tgPostLink(ch, p);
              return (
                <li key={p.msg_id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="text-xs text-muted">
                      {TG_MEDIA_LABEL[p.media_type || "other"] || "Пост"} · {fmtDateTime(p.posted_at)}
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink line-clamp-2">{p.text || "Без текста"}</p>
                  </div>
                  <div className="flex items-center gap-4 text-[13px] tabular">
                    <span title="Просмотры">
                      <span className="font-medium text-ink">{fmtNum(p.views)}</span> <span className="text-muted">просм.</span>
                    </span>
                    <span className="text-muted" title="ERR">
                      ERR {fmtPct(tgPostErr(p, tgSubsOn(rows, postDate(p)) ?? ch.subscribers), 0)}
                    </span>
                    {link && (
                      <a href={link} target="_blank" rel="noreferrer" className="text-sub hover:text-accent" title="Открыть в Telegram">
                        <IconExternal width={15} height={15} />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Лучшее время для публикаций"
          subtitle={
            historyCount >= 5
              ? `Средние просмотры поста по дню и времени выхода, московское время. Основано на ${historyCount} ${plural(historyCount, "посте", "постах", "постах")} за 180 дней`
              : "Нужно хотя бы 5 постов за последние 180 дней"
          }
        />
        {historyCount >= 5 && (
          <div className="grid gap-4 px-3 pb-4 md:grid-cols-2">
            <div>
              <p className="px-2 pb-1 text-[13px] text-sub">По дням недели</p>
              <CategoryChart data={times.byWeekday} valueKey="viewsAvg" label="Средние просмотры" format={(v) => fmtNum(v)} />
              <p className="px-2 text-xs text-muted">Постов: {times.byWeekday.map((s) => `${s.label} ${s.count}`).join(" · ")}</p>
            </div>
            <div>
              <p className="px-2 pb-1 text-[13px] text-sub">По времени выхода</p>
              <CategoryChart data={times.byHour} valueKey="viewsAvg" label="Средние просмотры" format={(v) => fmtNum(v)} />
              <p className="px-2 text-xs text-muted">Постов: {times.byHour.map((s) => `${s.label} ${s.count}`).join(" · ")}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
