"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { DailyRow, Post } from "@/lib/types";
import { addDays, lastCompleteMetaDay } from "@/lib/dates";
import { fmtCompact, fmtNum, fmtPct, fmtSigned, plural } from "@/lib/format";
import {
  bestTime,
  dailySeries,
  KIND_LABEL,
  postDate,
  postErr,
  statsByKind,
  summarize,
} from "@/lib/metrics";
import { useApi } from "../useApi";
import { Avatar, Card, CardHeader, Delta, Empty, ErrorNote, KindBadge, KpiTile, Segmented, Thumb, cx } from "../ui";
import { CategoryChart, ChartCard, FOLLOWS_SERIES, FollowsChart, SERIES, TimeChart } from "../charts";
import { IconExternal } from "../icons";
import { postKind } from "@/lib/metrics";

type StatsResp = { rows: DailyRow[]; prevFrom: string; prevTo: string };
type PostsResp = { posts: Post[] };

const DAY_METRICS = {
  reach: { label: "Охват", hint: "Сколько уникальных аккаунтов видели ваш контент за день" },
  views: { label: "Просмотры", hint: "Сколько раз показали ваш контент: публикации, Reels и Stories" },
  profile_views: { label: "Посещения профиля", hint: "Сколько раз открыли профиль" },
  total_interactions: { label: "Взаимодействия", hint: "Лайки, комментарии, сохранения, репосты и ответы на Stories" },
  website_clicks: { label: "Клики по ссылке", hint: "Нажатия на ссылку в профиле" },
} as const;
type DayMetric = keyof typeof DAY_METRICS;

export function OverviewView({ ctx }: { ctx: Ctx }) {
  const account = ctx.account!;
  const stats = useApi<StatsResp>(`/api/stats?account=${account.id}&from=${ctx.from}&to=${ctx.to}`);
  const posts = useApi<PostsResp>(`/api/posts?account=${account.id}&from=${ctx.from}&to=${ctx.to}`);
  const last = lastCompleteMetaDay();
  const history = useApi<PostsResp>(`/api/posts?account=${account.id}&from=${addDays(last, -179)}&to=${last}`);
  const [metric, setMetric] = useState<DayMetric>("reach");

  const rows = stats.data?.rows || [];
  const allPosts = posts.data?.posts || [];
  const cur = useMemo(
    () => summarize(rows, allPosts, ctx.from, ctx.to, account.followers_count),
    [rows, allPosts, ctx.from, ctx.to, account.followers_count]
  );
  const prev = useMemo(
    () =>
      stats.data
        ? summarize(rows, allPosts, stats.data.prevFrom, stats.data.prevTo, account.followers_count)
        : null,
    [rows, allPosts, stats.data, account.followers_count]
  );

  const series = useMemo(() => {
    const s = dailySeries(rows, ctx.from, ctx.to, [
      "followers",
      "follows",
      "unfollows",
      "reach",
      "views",
      "profile_views",
      "total_interactions",
      "website_clicks",
    ]);
    return s.map((p) => ({ ...p, unfollowsNeg: p.unfollows != null ? -p.unfollows : null }));
  }, [rows, ctx.from, ctx.to]);

  const periodPosts = allPosts.filter((p) => {
    const d = postDate(p);
    return d >= ctx.from && d <= ctx.to;
  });
  const kinds = statsByKind(periodPosts);
  const top = [...periodPosts].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 6);
  const times = useMemo(() => bestTime(history.data?.posts || []), [history.data]);
  const historyCount = history.data?.posts.length || 0;
  const calcFollowers = rows.some((r) => r.date >= ctx.from && r.date <= ctx.to && r.followers_source === "calc");

  if (stats.error) return <ErrorNote error={stats.error} />;
  const loading = stats.loading || posts.loading;

  return (
    <div className={cx("space-y-5 transition-opacity", loading && stats.data && "opacity-60")}>
      {/* Профиль */}
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar account={account} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2">
              <h2 className="text-lg font-semibold text-ink">{account.name || account.display_name}</h2>
              <a
                href={`https://instagram.com/${account.username}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
              >
                @{account.username}
                <IconExternal width={13} height={13} />
              </a>
            </div>
            {account.biography && <p className="mt-1 text-sm text-sub line-clamp-2 whitespace-pre-line">{account.biography}</p>}
          </div>
          <div className="flex gap-6 text-center">
            {[
              ["Подписчики", account.followers_count],
              ["Подписки", account.follows_count],
              ["Публикации", account.media_count],
            ].map(([label, v]) => (
              <div key={label as string}>
                <div className="text-lg font-semibold text-ink">{fmtNum(v as number)}</div>
                <div className="text-xs text-muted">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Ключевые показатели */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label="Подписчики"
          value={fmtNum(cur.followersEnd ?? account.followers_count)}
          sub={cur.followersDelta != null ? `${fmtSigned(cur.followersDelta)} за период` : "нет истории за период"}
          delta={<Delta cur={cur.followersEnd} prev={cur.followersStart} />}
        />
        <KpiTile
          label="Подписки / отписки"
          value={
            cur.follows != null ? (
              <span>
                <span className="text-up">+{fmtNum(cur.follows)}</span>
                <span className="text-muted font-normal"> / </span>
                <span className="text-down">−{fmtNum(cur.unfollows)}</span>
              </span>
            ) : (
              "—"
            )
          }
          sub={prev?.follows != null ? `прошлый период: +${fmtNum(prev.follows)} / −${fmtNum(prev.unfollows)}` : undefined}
          hint="Instagram отдаёт подписки и отписки по дням только за последние 30 дней, дальше их копит сайт"
        />
        <KpiTile
          label="Средний охват в день"
          value={fmtNum(cur.reachAvg)}
          delta={<Delta cur={cur.reachAvg} prev={prev?.reachAvg} />}
          hint={DAY_METRICS.reach.hint}
        />
        <KpiTile
          label="Просмотры"
          value={fmtCompact(cur.viewsSum)}
          delta={<Delta cur={cur.viewsSum} prev={prev?.viewsSum} />}
          hint={DAY_METRICS.views.hint}
        />
        <KpiTile
          label="Посещения профиля"
          value={fmtNum(cur.profileViewsSum)}
          delta={<Delta cur={cur.profileViewsSum} prev={prev?.profileViewsSum} />}
        />
        <KpiTile
          label="Взаимодействия"
          value={fmtNum(cur.interactionsSum)}
          delta={<Delta cur={cur.interactionsSum} prev={prev?.interactionsSum} />}
          hint={DAY_METRICS.total_interactions.hint}
        />
        <KpiTile
          label="Клики по ссылке"
          value={fmtNum(cur.websiteClicksSum)}
          delta={<Delta cur={cur.websiteClicksSum} prev={prev?.websiteClicksSum} />}
        />
        <KpiTile
          label="Публикации"
          value={fmtNum(cur.posts)}
          sub={cur.postsReachAvg != null ? `средний охват ${fmtNum(cur.postsReachAvg)}` : undefined}
          delta={<Delta cur={cur.posts} prev={prev?.posts} />}
        />
        <KpiTile
          label="ER"
          value={fmtPct(cur.er, 2)}
          delta={<Delta cur={cur.er} prev={prev?.er} mode="pp" />}
          hint="Вовлечённость по подписчикам: (лайки + комментарии + сохранения + репосты) / подписчики, среднее по публикациям периода"
        />
        <KpiTile
          label="ERR"
          value={fmtPct(cur.err, 2)}
          delta={<Delta cur={cur.err} prev={prev?.err} mode="pp" />}
          hint="Вовлечённость по охвату: (лайки + комментарии + сохранения + репосты) / охват публикации, среднее по публикациям периода"
        />
      </div>

      {/* Подписчики */}
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard
          title="Подписчики"
          subtitle="Число подписчиков на конец дня"
          data={series}
          series={[{ key: "followers", label: "Подписчики", color: SERIES[0] }]}
          footer={
            calcFollowers ? (
              <p className="px-5 pb-3 text-xs text-muted">
                Часть дней восстановлена по подпискам и отпискам: Instagram не хранит число подписчиков за прошлые дни.
              </p>
            ) : null
          }
        >
          <TimeChart
            data={series}
            series={[{ key: "followers", label: "Подписчики", color: SERIES[0] }]}
            connectNulls
            domain={["auto", "auto"]}
          />
        </ChartCard>
        <ChartCard title="Подписки и отписки" subtitle="Сколько подписались и отписались за день" data={series} series={FOLLOWS_SERIES}>
          <FollowsChart data={series} height={260} />
        </ChartCard>
      </div>

      {/* Метрики по дням */}
      <ChartCard
        title={DAY_METRICS[metric].label}
        subtitle={`${DAY_METRICS[metric].hint}. Сутки по времени Instagram (тихоокеанское)`}
        data={series}
        series={[{ key: metric, label: DAY_METRICS[metric].label, color: SERIES[0] }]}
        actions={
          <Segmented
            size="sm"
            value={metric}
            onChange={setMetric}
            options={(Object.keys(DAY_METRICS) as DayMetric[]).map((k) => ({ value: k, label: DAY_METRICS[k].label }))}
          />
        }
      >
        <TimeChart data={series} series={[{ key: metric, label: DAY_METRICS[metric].label, color: SERIES[0] }]} kind="bar" height={280} />
      </ChartCard>

      {/* Контент */}
      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Типы публикаций" subtitle="Средние показатели одной публикации за период" />
          {kinds.length === 0 ? (
            <Empty title="За период нет публикаций" />
          ) : (
            <div className="overflow-x-auto px-5 pb-4">
              <table className="w-full text-[13px] tabular">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-2 pr-3 font-medium">Тип</th>
                    <th className="py-2 pr-3 text-right font-medium">Шт.</th>
                    <th className="py-2 pr-3 text-right font-medium">Охват</th>
                    <th className="py-2 pr-3 text-right font-medium">Просмотры</th>
                    <th className="py-2 pr-3 text-right font-medium">Реакции</th>
                    <th className="py-2 text-right font-medium">ERR</th>
                  </tr>
                </thead>
                <tbody>
                  {kinds.map((k) => (
                    <tr key={k.kind} className="border-b border-hair">
                      <td className="py-2 pr-3 text-ink">{KIND_LABEL[k.kind]}</td>
                      <td className="py-2 pr-3 text-right">{k.count}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(k.reachAvg)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(k.viewsAvg)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(k.interactionsAvg, 1)}</td>
                      <td className="py-2 text-right">{fmtPct(k.errAvg, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Лучшие публикации периода" subtitle="По охвату" />
          {top.length === 0 ? (
            <Empty title="За период нет публикаций" />
          ) : (
            <div className="grid grid-cols-2 gap-3 px-5 pb-5 sm:grid-cols-3">
              {top.map((p) => (
                <button key={p.id} onClick={() => ctx.openPost(p.id)} className="group text-left">
                  <div className="relative overflow-hidden rounded-lg">
                    <Thumb src={p.thumb_url} className="aspect-square w-full transition group-hover:scale-[1.02]" />
                    <KindBadge kind={postKind(p)} className="absolute left-2 top-2" />
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-medium text-ink">{fmtNum(p.reach)}</span>
                    <span className="text-muted">ERR {fmtPct(postErr(p), 1)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Лучшее время */}
      <Card>
        <CardHeader
          title="Лучшее время для публикаций"
          subtitle={
            historyCount >= 5
              ? `Средний ERR публикаций по дню и времени выхода, московское время. Основано на ${historyCount} ${plural(historyCount, "публикации", "публикациях", "публикациях")} за 180 дней`
              : "Нужно хотя бы 5 публикаций за последние 180 дней"
          }
        />
        {historyCount >= 5 && (
          <div className="grid gap-4 px-3 pb-4 md:grid-cols-2">
            <div>
              <p className="px-2 pb-1 text-[13px] text-sub">По дням недели</p>
              <CategoryChart data={times.byWeekday} valueKey="errAvg" label="Средний ERR" format={(v) => fmtPct(v, 1)} />
              <p className="px-2 text-xs text-muted">
                Публикаций: {times.byWeekday.map((s) => `${s.label} ${s.count}`).join(" · ")}
              </p>
            </div>
            <div>
              <p className="px-2 pb-1 text-[13px] text-sub">По времени выхода</p>
              <CategoryChart data={times.byHour} valueKey="errAvg" label="Средний ERR" format={(v) => fmtPct(v, 1)} />
              <p className="px-2 text-xs text-muted">
                Публикаций: {times.byHour.map((s) => `${s.label} ${s.count}`).join(" · ")}
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
