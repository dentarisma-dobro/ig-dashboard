"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { TgDaily, TgPost } from "@/lib/types";
import { fmtDateTime, fmtNum, fmtPct, plural } from "@/lib/format";
import { postDate } from "@/lib/metrics";
import { periodPosts, tgPostEr, tgPostErr, tgPostLink, tgSubsOn, TG_MEDIA_LABEL } from "@/lib/tgmetrics";
import { useApi } from "../useApi";
import { Avatar, Card, Empty, ErrorNote, cx } from "../ui";
import { IconExternal } from "../icons";

type SortKey = "date" | "views" | "views_24h" | "err" | "er" | "reactions" | "forwards" | "comments";
const SORTS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Сначала новые" },
  { value: "views", label: "По просмотрам" },
  { value: "views_24h", label: "По охвату за 24 часа" },
  { value: "err", label: "По ERR" },
  { value: "er", label: "По ER" },
  { value: "reactions", label: "По реакциям" },
  { value: "forwards", label: "По репостам" },
  { value: "comments", label: "По комментариям" },
];

export function TgPostsView({ ctx }: { ctx: Ctx }) {
  const channelParam = ctx.tgChannel ? ctx.tgChannel.id : "all";
  const q = `channel=${channelParam}&from=${ctx.from}&to=${ctx.to}`;
  const posts = useApi<{ posts: TgPost[] }>(`/api/tg/posts?${q}`);
  const stats = useApi<{ rows: TgDaily[] }>(`/api/tg/stats?${q}`);
  const [sort, setSort] = useState<SortKey>("date");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const daily = stats.data?.rows || [];
    const list = periodPosts(posts.data?.posts || [], ctx.from, ctx.to)
      .filter((p) => !search || (p.text || "").toLowerCase().includes(search.toLowerCase()))
      .map((p) => {
        const ch = ctx.tgChannels.find((c) => c.id === p.channel_id);
        const subs = tgSubsOn(daily.filter((r) => r.channel_id === p.channel_id), postDate(p)) ?? ch?.subscribers;
        return { ...p, ch, err: tgPostErr(p, subs), er: tgPostEr(p) };
      });
    const val = (p: (typeof list)[number]): number => {
      if (sort === "date") return Date.parse(p.posted_at);
      if (sort === "err") return p.err ?? -1;
      if (sort === "er") return p.er ?? -1;
      return (p[sort] as number | null) ?? -1;
    };
    return list.sort((a, b) => val(b) - val(a));
  }, [posts.data, stats.data, ctx.tgChannels, ctx.from, ctx.to, sort, search]);

  const multi = !ctx.tgChannel;
  const avgViews = rows.length ? rows.reduce((a, p) => a + (p.views || 0), 0) / rows.length : null;

  if (posts.error) return <ErrorNote error={posts.error} />;

  return (
    <div className={cx("space-y-4 transition-opacity", posts.loading && posts.data && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по тексту"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm sm:w-64"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
          aria-label="Сортировка"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[13px] text-sub">
          {rows.length} {plural(rows.length, "пост", "поста", "постов")}
          {avgViews != null && ` · средний охват ${fmtNum(avgViews)}`}
        </span>
      </div>

      {rows.length === 0 && !posts.loading ? (
        <Card>
          <Empty title="Постов за период нет" />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-[13px] tabular">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-2.5 pl-4 pr-3 font-medium">Пост</th>
                  {multi && <th className="py-2.5 pr-3 font-medium">Канал</th>}
                  <th className="py-2.5 pr-3 font-medium whitespace-nowrap">Дата</th>
                  {["Просмотры", "За 24 ч", "ERR", "Реакции", "Репосты", "Комм.", "ER", ""].map((h, i) => (
                    <th key={i} className="py-2.5 pr-3 text-right font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const link = tgPostLink(p.ch, p);
                  return (
                    <tr key={`${p.channel_id}-${p.msg_id}`} className="border-b border-hair align-top hover:bg-page">
                      <td className="py-2 pl-4 pr-3">
                        <div className="text-xs text-muted">{TG_MEDIA_LABEL[p.media_type || "other"] || "Пост"}</div>
                        <div className="max-w-[360px] text-ink line-clamp-2">{p.text || "Без текста"}</div>
                      </td>
                      {multi && (
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {p.ch && (
                            <span className="inline-flex items-center gap-1.5 text-sub">
                              <Avatar account={{ avatar_url: p.ch.avatar_url, display_name: p.ch.title, username: p.ch.username || "" }} size={18} />
                              {p.ch.title}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="py-2 pr-3 whitespace-nowrap text-sub">{fmtDateTime(p.posted_at)}</td>
                      <td className="py-2 pr-3 text-right font-medium text-ink">{fmtNum(p.views)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(p.views_24h)}</td>
                      <td className="py-2 pr-3 text-right">{fmtPct(p.err, 1)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(p.reactions)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(p.forwards)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(p.comments)}</td>
                      <td className="py-2 pr-3 text-right">{fmtPct(p.er, 2)}</td>
                      <td className="py-2 pr-4 text-right">
                        {link && (
                          <a href={link} target="_blank" rel="noreferrer" className="text-sub hover:text-accent" title="Открыть в Telegram">
                            <IconExternal width={15} height={15} />
                          </a>
                        )}
                      </td>
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
