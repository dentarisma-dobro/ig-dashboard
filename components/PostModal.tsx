"use client";

import { useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { Post, PostSnapshot } from "@/lib/types";
import { fmtDateTime, fmtDuration, fmtNum, fmtPct } from "@/lib/format";
import { interactions, KIND_LABEL, postEr, postErr, postKind } from "@/lib/metrics";
import { useApi } from "./useApi";
import { Modal, Segmented, Spinner, Thumb } from "./ui";
import { SERIES, TimeChart } from "./charts";
import { IconExternal } from "./icons";

type HistoryKey = "reach" | "views" | "likes" | "saved";
const HISTORY: Record<HistoryKey, string> = { reach: "Охват", views: "Просмотры", likes: "Лайки", saved: "Сохранения" };

export function PostModal({ postId, onClose, ctx }: { postId: string | null; onClose: () => void; ctx: Ctx }) {
  const q = useApi<{ post: Post; history: PostSnapshot[] }>(postId ? `/api/posts/${postId}` : null);
  const [key, setKey] = useState<HistoryKey>("reach");
  const post = q.data?.post?.id === postId ? q.data.post : null;
  const history = post ? q.data!.history : [];
  const account = post ? ctx.accounts.find((a) => a.id === post.account_id) : null;

  return (
    <Modal open={!!postId} onClose={onClose} title={post ? `${KIND_LABEL[postKind(post)]} · ${fmtDateTime(post.posted_at)}` : "Публикация"} wide>
      {!post ? (
        <div className="flex justify-center py-16">
          {q.error ? <p className="text-sm text-down">{q.error}</p> : <Spinner className="h-6 w-6" />}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[280px_1fr]">
          <div>
            <Thumb src={post.thumb_url} className="aspect-square w-full rounded-lg" />
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm text-accent hover:underline"
              >
                Открыть в Instagram <IconExternal width={14} height={14} />
              </a>
            )}
            <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-sub scrollbar-thin">
              {post.caption || "Без подписи"}
            </p>
          </div>
          <div className="min-w-0">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Охват", fmtNum(post.reach)],
                ["Просмотры", fmtNum(post.views)],
                ["Лайки", fmtNum(post.likes)],
                ["Комментарии", fmtNum(post.comments)],
                ["Сохранения", fmtNum(post.saved)],
                ["Репосты", fmtNum(post.shares)],
                ["Реакции всего", fmtNum(interactions(post))],
                ["ERR", fmtPct(postErr(post), 2)],
                ["ER", fmtPct(postEr(post, account?.followers_count), 2)],
                ...(postKind(post) === "reels"
                  ? [
                      ["Ср. время просмотра", fmtDuration(post.avg_watch_time_ms)],
                      ["Общее время просмотра", fmtDuration(post.total_watch_time_ms)],
                    ]
                  : [
                      ["Визиты в профиль", fmtNum(post.profile_visits)],
                      ["Подписки с поста", fmtNum(post.follows)],
                    ]),
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-page px-3 py-2">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 text-base font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">Динамика</h3>
                <Segmented
                  size="sm"
                  value={key}
                  onChange={setKey}
                  options={(Object.keys(HISTORY) as HistoryKey[]).map((k) => ({ value: k, label: HISTORY[k] }))}
                />
              </div>
              {history.length < 2 ? (
                <p className="rounded-lg bg-page px-4 py-6 text-center text-sm text-muted">
                  Сайт сохраняет метрики публикации каждый день в течение 45 дней после выхода. График появится после второго замера.
                </p>
              ) : (
                <TimeChart
                  data={history.map((h) => ({ ...h }))}
                  series={[{ key, label: HISTORY[key], color: SERIES[0] }]}
                  height={220}
                  connectNulls
                />
              )}
              {post.insights_updated_at && (
                <p className="mt-2 text-xs text-muted">Статистика обновлена {fmtDateTime(post.insights_updated_at)}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
