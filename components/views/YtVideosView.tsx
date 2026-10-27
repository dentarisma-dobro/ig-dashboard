"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { YtVideo } from "@/lib/types";
import { fmtCompact, fmtDateTime, fmtNum, fmtPct, plural } from "@/lib/format";
import { fmtClock, periodVideos, ytEr, ytKindLabel } from "@/lib/ytmetrics";
import { useApi } from "../useApi";
import { Avatar, Card, Empty, ErrorNote, Segmented, Thumb, cx } from "../ui";
import { IconComment, IconEye, IconGrid, IconHeart, IconList } from "../icons";

type SortKey = "date" | "views" | "likes" | "comments" | "er" | "views_24h" | "views_7d" | "avg_view_percentage" | "impressions_ctr";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Сначала новые" },
  { value: "views", label: "По просмотрам" },
  { value: "likes", label: "По лайкам" },
  { value: "comments", label: "По комментариям" },
  { value: "er", label: "По ER" },
  { value: "views_24h", label: "По просмотрам за 24 часа" },
  { value: "views_7d", label: "По просмотрам за 7 дней" },
  { value: "avg_view_percentage", label: "По досмотру" },
  { value: "impressions_ctr", label: "По CTR обложки" },
];

export function YtVideosView({ ctx, onOpenVideo }: { ctx: Ctx; onOpenVideo: (id: string) => void }) {
  const channelParam = ctx.ytChannel ? ctx.ytChannel.id : "all";
  const q = useApi<{ videos: YtVideo[] }>(`/api/yt/videos?channel=${channelParam}&from=${ctx.from}&to=${ctx.to}`);
  const [type, setType] = useState<"all" | "video" | "shorts">("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [layout, setLayout] = useState<"grid" | "table">("grid");

  const list = useMemo(() => {
    const vs = periodVideos(q.data?.videos || [], ctx.from, ctx.to).filter(
      (v) => type === "all" || (type === "shorts" ? v.is_short : !v.is_short)
    );
    const val = (v: YtVideo): number => {
      if (sort === "date") return Date.parse(v.published_at);
      if (sort === "er") return ytEr(v) ?? -1;
      return v[sort] != null ? Number(v[sort]) : -1;
    };
    return vs.sort((a, b) => val(b) - val(a));
  }, [q.data, ctx.from, ctx.to, type, sort]);

  const all = periodVideos(q.data?.videos || [], ctx.from, ctx.to);
  const multi = !ctx.ytChannel;
  const avgViews = list.length ? list.reduce((a, v) => a + (v.views || 0), 0) / list.length : null;
  const analytics = list.some((v) => v.avg_view_percentage != null);

  if (q.error) return <ErrorNote error={q.error} />;

  return (
    <div className={cx("space-y-4 transition-opacity", q.loading && q.data && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: "all", label: `Все · ${all.length}` },
            { value: "video", label: `Видео · ${all.filter((v) => !v.is_short).length}` },
            { value: "shorts", label: `Shorts · ${all.filter((v) => v.is_short).length}` },
          ]}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" aria-label="Сортировка">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[13px] text-sub">
            {list.length} {plural(list.length, "видео", "видео", "видео")}
            {avgViews != null && ` · в среднем ${fmtNum(avgViews)} просмотров`}
          </span>
          <Segmented
            size="sm"
            value={layout}
            onChange={setLayout}
            options={[
              { value: "grid", label: <IconGrid width={15} height={15} aria-label="Плиткой" /> },
              { value: "table", label: <IconList width={15} height={15} aria-label="Таблицей" /> },
            ]}
          />
        </div>
      </div>

      {list.length === 0 && !q.loading ? (
        <Card>
          <Empty title="Видео за период нет" />
        </Card>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((v) => {
            const ch = ctx.ytChannels.find((c) => c.id === v.channel_id);
            return (
              <button key={v.id} onClick={() => onOpenVideo(v.id)} className="overflow-hidden rounded-xl border border-line bg-card text-left transition hover:shadow-pop">
                <div className="relative">
                  <Thumb src={v.thumb_url} className="aspect-video w-full" />
                  <span className="absolute left-2 top-2 rounded-md bg-ink/75 px-1.5 py-0.5 text-[11px] font-medium text-white">{ytKindLabel(v)}</span>
                  <span className="absolute bottom-2 right-2 rounded bg-ink/80 px-1 text-[11px] text-white tabular">{fmtClock(v.duration_sec)}</span>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    {multi && ch && <Avatar account={{ avatar_url: ch.avatar_url, display_name: ch.title, username: ch.handle || "" }} size={16} />}
                    {fmtDateTime(v.published_at)}
                  </div>
                  <p className="mt-1 h-9 text-[13px] leading-snug text-ink line-clamp-2">{v.title}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub tabular">
                    <span className="inline-flex items-center gap-1" title="Просмотры">
                      <IconEye width={13} height={13} className="text-muted" />
                      {fmtCompact(v.views)}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Лайки">
                      <IconHeart width={13} height={13} className="text-muted" />
                      {fmtCompact(v.likes)}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Комментарии">
                      <IconComment width={13} height={13} className="text-muted" />
                      {fmtCompact(v.comments)}
                    </span>
                    <span title="ER">ER {fmtPct(ytEr(v), 1)}</span>
                    {v.avg_view_percentage != null && <span title="Досмотр">досмотр {fmtPct(v.avg_view_percentage, 0)}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-[13px] tabular">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-2.5 pl-4 pr-3 font-medium">Видео</th>
                  {multi && <th className="py-2.5 pr-3 font-medium">Канал</th>}
                  <th className="py-2.5 pr-3 font-medium whitespace-nowrap">Дата</th>
                  {["Просмотры", "24 ч", "7 дн", "Лайки", "Комм.", "ER", ...(analytics ? ["Досмотр", "Ср. просмотр", "CTR"] : [])].map((h) => (
                    <th key={h} className="py-2.5 pr-3 text-right font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((v) => {
                  const ch = ctx.ytChannels.find((c) => c.id === v.channel_id);
                  return (
                    <tr key={v.id} onClick={() => onOpenVideo(v.id)} className="cursor-pointer border-b border-hair hover:bg-page">
                      <td className="py-2 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <Thumb src={v.thumb_url} className="h-10 w-[71px] shrink-0 rounded-md" />
                          <div className="min-w-0">
                            <div className="text-xs text-muted">
                              {ytKindLabel(v)} · {fmtClock(v.duration_sec)}
                            </div>
                            <div className="max-w-[300px] truncate text-ink">{v.title}</div>
                          </div>
                        </div>
                      </td>
                      {multi && <td className="py-2 pr-3 whitespace-nowrap text-sub">{ch?.title}</td>}
                      <td className="py-2 pr-3 whitespace-nowrap text-sub">{fmtDateTime(v.published_at)}</td>
                      <td className="py-2 pr-3 text-right font-medium text-ink">{fmtNum(v.views)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(v.views_24h)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(v.views_7d)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(v.likes)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(v.comments)}</td>
                      <td className="py-2 pr-3 text-right">{fmtPct(ytEr(v), 2)}</td>
                      {analytics && (
                        <>
                          <td className="py-2 pr-3 text-right">{fmtPct(v.avg_view_percentage, 1)}</td>
                          <td className="py-2 pr-3 text-right">{fmtClock(v.avg_view_duration)}</td>
                          <td className="py-2 pr-4 text-right">{fmtPct(v.impressions_ctr, 2)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
