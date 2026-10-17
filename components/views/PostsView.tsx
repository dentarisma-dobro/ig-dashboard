"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { DailyRow, Post } from "@/lib/types";
import { fmtCompact, fmtDateTime, fmtNum, fmtPct, plural } from "@/lib/format";
import { followersOn, interactions, KIND_LABEL, postDate, postEr, postErr, postKind, type PostKind } from "@/lib/metrics";
import { useApi } from "../useApi";
import { Avatar, Card, Empty, ErrorNote, KindBadge, Segmented, Thumb, cx } from "../ui";
import { IconBookmark, IconComment, IconEye, IconGrid, IconHeart, IconList, IconReach, IconShare } from "../icons";

type SortKey = "date" | "reach" | "views" | "likes" | "comments" | "saved" | "shares" | "err" | "er";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Сначала новые" },
  { value: "reach", label: "По охвату" },
  { value: "views", label: "По просмотрам" },
  { value: "likes", label: "По лайкам" },
  { value: "comments", label: "По комментариям" },
  { value: "saved", label: "По сохранениям" },
  { value: "shares", label: "По репостам" },
  { value: "err", label: "По ERR" },
  { value: "er", label: "По ER" },
];

type Row = Post & { kind: PostKind; er: number | null; err: number | null; inter: number };

export function PostsView({ ctx }: { ctx: Ctx }) {
  const q = `account=${ctx.accountId}&from=${ctx.from}&to=${ctx.to}`;
  const posts = useApi<{ posts: Post[] }>(`/api/posts?${q}`);
  const stats = useApi<{ rows: DailyRow[] }>(`/api/stats?${q}`);
  const [kind, setKind] = useState<"all" | "reels" | "carousel" | "photo">("all");
  const [sort, setSort] = useState<SortKey>("date");
  const [layout, setLayout] = useState<"grid" | "table">("grid");

  const rows: Row[] = useMemo(() => {
    const daily = stats.data?.rows || [];
    const byAccount = new Map<string, DailyRow[]>();
    for (const r of daily) byAccount.set(r.account_id, [...(byAccount.get(r.account_id) || []), r]);
    return (posts.data?.posts || [])
      .filter((p) => {
        const d = postDate(p);
        return d >= ctx.from && d <= ctx.to;
      })
      .map((p) => {
        const acc = ctx.accounts.find((a) => a.id === p.account_id);
        const followers = followersOn(byAccount.get(p.account_id) || [], postDate(p)) ?? acc?.followers_count;
        return { ...p, kind: postKind(p), er: postEr(p, followers), err: postErr(p), inter: interactions(p) };
      });
  }, [posts.data, stats.data, ctx.accounts, ctx.from, ctx.to]);

  const shown = useMemo(() => {
    const list = rows.filter((p) => kind === "all" || p.kind === kind || (kind === "reels" && p.kind === "video"));
    const val = (p: Row): number => {
      if (sort === "date") return Date.parse(p.posted_at);
      if (sort === "err") return p.err ?? -1;
      if (sort === "er") return p.er ?? -1;
      return (p[sort] as number | null) ?? -1;
    };
    return [...list].sort((a, b) => val(b) - val(a));
  }, [rows, kind, sort]);

  const count = (k: string) => rows.filter((p) => k === "all" || p.kind === k || (k === "reels" && p.kind === "video")).length;
  const avgReach = shown.length ? shown.reduce((a, p) => a + (p.reach || 0), 0) / shown.length : null;
  const errs = shown.map((p) => p.err).filter((v): v is number => v != null);
  const avgErr = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
  const multi = !ctx.account;

  if (posts.error) return <ErrorNote error={posts.error} />;

  return (
    <div className={cx("space-y-4 transition-opacity", posts.loading && posts.data && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: `Все · ${count("all")}` },
            { value: "reels", label: `Reels · ${count("reels")}` },
            { value: "carousel", label: `Карусели · ${count("carousel")}` },
            { value: "photo", label: `Фото · ${count("photo")}` },
          ]}
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
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[13px] text-sub">
            {shown.length} {plural(shown.length, "публикация", "публикации", "публикаций")}
            {avgReach != null && ` · средний охват ${fmtNum(avgReach)}`}
            {avgErr != null && ` · ERR ${fmtPct(avgErr, 2)}`}
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

      {shown.length === 0 && !posts.loading ? (
        <Card>
          <Empty title="Публикаций за период нет">Выберите другой период или тип публикаций.</Empty>
        </Card>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {shown.map((p) => {
            const acc = ctx.accounts.find((a) => a.id === p.account_id);
            return (
              <button
                key={p.id}
                onClick={() => ctx.openPost(p.id)}
                className="group overflow-hidden rounded-xl border border-line bg-card text-left transition hover:shadow-pop"
              >
                <div className="relative">
                  <Thumb src={p.thumb_url} className="aspect-square w-full" />
                  <KindBadge kind={p.kind} className="absolute left-2 top-2" />
                  {p.err != null && (
                    <span className="absolute right-2 top-2 rounded-md bg-card/90 px-1.5 py-0.5 text-[11px] font-medium text-ink">
                      ERR {fmtPct(p.err, 1)}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    {multi && acc && <Avatar account={acc} size={16} />}
                    {fmtDateTime(p.posted_at)}
                  </div>
                  <p className="mt-1 h-9 text-[13px] leading-snug text-ink line-clamp-2">{p.caption || "Без подписи"}</p>
                  <div className="mt-2 grid grid-cols-3 gap-y-1 text-xs text-sub tabular">
                    <Metric icon={<IconReach width={13} height={13} />} value={fmtCompact(p.reach)} title="Охват" />
                    <Metric icon={<IconEye width={13} height={13} />} value={fmtCompact(p.views)} title="Просмотры" />
                    <Metric icon={<IconHeart width={13} height={13} />} value={fmtCompact(p.likes)} title="Лайки" />
                    <Metric icon={<IconComment width={13} height={13} />} value={fmtCompact(p.comments)} title="Комментарии" />
                    <Metric icon={<IconBookmark width={13} height={13} />} value={fmtCompact(p.saved)} title="Сохранения" />
                    <Metric icon={<IconShare width={13} height={13} />} value={fmtCompact(p.shares)} title="Репосты" />
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
                  <th className="py-2.5 pl-4 pr-3 font-medium">Публикация</th>
                  {multi && <th className="py-2.5 pr-3 font-medium">Аккаунт</th>}
                  <th className="py-2.5 pr-3 font-medium whitespace-nowrap">Дата</th>
                  {["Охват", "Просмотры", "Лайки", "Комм.", "Сохр.", "Репосты", "ER", "ERR"].map((h) => (
                    <th key={h} className="py-2.5 pr-3 text-right font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const acc = ctx.accounts.find((a) => a.id === p.account_id);
                  return (
                    <tr key={p.id} onClick={() => ctx.openPost(p.id)} className="cursor-pointer border-b border-hair hover:bg-page">
                      <td className="py-2 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <Thumb src={p.thumb_url} className="h-10 w-10 shrink-0 rounded-md" />
                          <div className="min-w-0">
                            <div className="text-xs text-muted">{KIND_LABEL[p.kind]}</div>
                            <div className="max-w-[280px] truncate text-ink">{p.caption || "Без подписи"}</div>
                          </div>
                        </div>
                      </td>
                      {multi && <td className="py-2 pr-3 whitespace-nowrap text-sub">{acc?.display_name}</td>}
                      <td className="py-2 pr-3 whitespace-nowrap text-sub">{fmtDateTime(p.posted_at)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(p.reach)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(p.views)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(p.likes)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(p.comments)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(p.saved)}</td>
                      <td className="py-2 pr-3 text-right">{fmtNum(p.shares)}</td>
                      <td className="py-2 pr-3 text-right">{fmtPct(p.er, 2)}</td>
                      <td className="py-2 pr-4 text-right">{fmtPct(p.err, 2)}</td>
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

function Metric({ icon, value, title }: { icon: React.ReactNode; value: string; title: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <span className="text-muted">{icon}</span>
      {value}
    </span>
  );
}
