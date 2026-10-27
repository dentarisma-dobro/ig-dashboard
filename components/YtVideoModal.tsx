"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { YtVideo } from "@/lib/types";
import { dateInTz, LOCAL_TZ } from "@/lib/dates";
import { fmtDateTime, fmtNum, fmtPct } from "@/lib/format";
import { fmtClock, ytEr, ytKindLabel, ytVideoLink } from "@/lib/ytmetrics";
import { useApi } from "./useApi";
import { Modal, Spinner, Thumb } from "./ui";
import { SERIES, TimeChart } from "./charts";
import { IconExternal } from "./icons";

type Resp = {
  video: YtVideo & { description?: string | null };
  snapshots: { captured_at: string; views: number | null }[];
  retention: { ratio: number; watch: number; relative: number }[] | null;
  retentionError: string | null;
};

export function YtVideoModal({ videoId, onClose }: { videoId: string | null; onClose: () => void }) {
  const q = useApi<Resp>(videoId ? `/api/yt/video/${videoId}` : null);
  const v = q.data?.video?.id === videoId ? q.data.video : null;

  // Замер на день: последний за дату
  const byDay = new Map<string, number | null>();
  for (const s of q.data?.snapshots || []) byDay.set(dateInTz(new Date(s.captured_at), LOCAL_TZ), s.views);
  const snaps = [...byDay].map(([date, views]) => ({ date, views }));
  const retention = (q.data?.retention || []).map((r) => ({ x: Math.round(r.ratio * 100), watch: Math.round(r.watch * 1000) / 10 }));

  return (
    <Modal open={!!videoId} onClose={onClose} title={v ? `${ytKindLabel(v)} · ${fmtDateTime(v.published_at)}` : "Видео"} wide>
      {!v ? (
        <div className="flex justify-center py-16">{q.error ? <p className="text-sm text-down">{q.error}</p> : <Spinner className="h-6 w-6" />}</div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[300px_1fr]">
          <div>
            <Thumb src={v.thumb_url?.replace("mqdefault", "hqdefault")} className="aspect-video w-full rounded-lg" />
            <p className="mt-2 text-sm font-medium text-ink">{v.title}</p>
            <a href={ytVideoLink(v)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-accent hover:underline">
              Открыть на YouTube <IconExternal width={14} height={14} />
            </a>
            <p className="mt-1 text-xs text-muted">Длительность {fmtClock(v.duration_sec)}</p>
          </div>
          <div className="min-w-0">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Просмотры", fmtNum(v.views)],
                ["Лайки", fmtNum(v.likes)],
                ["Комментарии", fmtNum(v.comments)],
                ["ER", fmtPct(ytEr(v), 2)],
                ["За 24 часа", fmtNum(v.views_24h)],
                ["За 7 дней", fmtNum(v.views_7d)],
                ...(v.watch_minutes != null
                  ? [
                      ["Время просмотра", `${fmtNum(Number(v.watch_minutes) / 60, 1)} ч`],
                      ["Средний просмотр", fmtClock(v.avg_view_duration)],
                      ["Досмотр", fmtPct(v.avg_view_percentage, 1)],
                      ["Подписались", fmtNum(v.subs_gained)],
                      ["Репосты", fmtNum(v.shares)],
                    ]
                  : []),
                ...(v.impressions != null
                  ? [
                      ["Показы обложки", fmtNum(v.impressions)],
                      ["CTR обложки", fmtPct(v.impressions_ctr, 2)],
                    ]
                  : []),
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-page px-3 py-2">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 text-base font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {retention.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-1 text-sm font-semibold text-ink">Удержание аудитории</h3>
                <p className="mb-2 text-xs text-muted">Какая доля зрителей смотрит каждый момент видео. Больше 100% значит, что момент пересматривают</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={retention}>
                    <CartesianGrid vertical={false} stroke="#eceef1" />
                    <XAxis dataKey="x" tickFormatter={(x) => `${x}%`} stroke="#8a929e" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(y) => `${y}%`} width={48} stroke="#8a929e" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(val: any) => [`${fmtNum(Number(val), 1)}%`, "Смотрят"]}
                      labelFormatter={(x) => `${x}% видео`}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e6e8ec", fontSize: 13 }}
                    />
                    <Line type="monotone" dataKey="watch" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {q.data?.retentionError && <p className="mt-3 text-xs text-muted">Удержание недоступно: {q.data.retentionError}</p>}

            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-ink">Просмотры по дням</h3>
              {snaps.length < 2 ? (
                <p className="rounded-lg bg-page px-4 py-6 text-center text-sm text-muted">
                  Сайт замеряет просмотры видео 4 раза в день первые 9 дней после выхода. График появится после второго дня замеров.
                </p>
              ) : (
                <TimeChart data={snaps} series={[{ key: "views", label: "Просмотры", color: SERIES[0] }]} height={200} connectNulls />
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
