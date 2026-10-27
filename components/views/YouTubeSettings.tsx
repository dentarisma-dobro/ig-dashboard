"use client";

import { useEffect, useState } from "react";
import type { YtChannel } from "@/lib/types";
import { fmtCompact } from "@/lib/format";
import { postJson } from "../useApi";
import { Avatar, Button, Card, CardHeader, Segmented, Spinner, cx } from "../ui";
import { IconCheck, IconRefresh } from "../icons";

export function YouTubeSettings({
  status,
  channels,
  onChanged,
}: {
  status: { apiKey: boolean; oauth: boolean } | null;
  channels: YtChannel[];
  onChanged: () => void;
}) {
  const [link, setLink] = useState("");
  const [own, setOwn] = useState<"own" | "rival">("own");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [linkedNow, setLinkedNow] = useState<string | null>(null);

  // Возврат со страницы входа Google: ?yt=linked|error&msg=…
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("yt") === "linked") setLinkedNow(p.get("msg") || "");
    if (p.get("yt") === "error") setError(p.get("msg") || "Не получилось подключить аналитику");
  }, []);

  // Сразу после входа Google загружаем аналитику подключённых каналов за всё время
  useEffect(() => {
    const linked = channels.filter((c) => c.analytics_linked);
    if (linkedNow == null || !linked.length) return;
    setLinkedNow(null);
    loadHistory(linked, `Аналитика подключена: ${linkedNow}. Загружаем её за всё время…`);
  }, [linkedNow, channels]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    setBusy(null);
  }

  const loadHistory = (list: YtChannel[], intro?: string) =>
    run(list.length === 1 ? `hist-${list[0].id}` : "hist-all", async () => {
      setProgress(intro ? [intro] : []);
      for (const ch of list) {
        let cursor: string | null = null;
        let total = 0;
        setProgress((p) => [...p, `${ch.title}: загружаем историю…`]);
        do {
          const r: { processed: number; nextCursor: string | null; note?: string } = await postJson("/api/yt/sync", { channel: ch.id, action: "history", cursor });
          total += r.processed;
          cursor = r.nextCursor;
          setProgress((p) => [...p, ...(r.note ? [`${ch.title}: ${r.note}`] : []), `${ch.title}: видео загружено ${total}`]);
        } while (cursor);
        setProgress((p) => [...p, `${ch.title}: история загружена`]);
      }
      onChanged();
    });
  const history = (ch: YtChannel) => loadHistory([ch]);

  const update = (ch: YtChannel) =>
    run(`upd-${ch.id}`, async () => {
      const r = await postJson<{ log: string[] }>("/api/yt/sync", { channel: ch.id, action: "update" });
      setProgress(r.log);
      onChanged();
    });

  if (!status) return null;
  const ready = status.apiKey || channels.some((c) => c.analytics_linked);

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="YouTube-каналы"
        subtitle="Публичные данные по любым каналам и аналитика YouTube Studio по своим"
        actions={
          status.oauth ? (
            <Button onClick={() => (window.location.href = "/api/yt/oauth/start")}>Подключить аналитику канала</Button>
          ) : undefined
        }
      />
      <div className="space-y-5 border-t border-line px-5 py-4">
        {(!status.apiKey || !status.oauth) && (
          <div className="rounded-lg bg-page px-4 py-3 text-[13px] text-sub">
            <p className="font-medium text-ink">Нужны ключи Google Cloud</p>
            <ul className="mt-1 space-y-0.5">
              <li>
                {status.apiKey ? "✓" : "○"} YT_API_KEY — ключ YouTube Data API v3 для публичных данных
              </li>
              <li>
                {status.oauth ? "✓" : "○"} GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET — вход Google для аналитики своих каналов
              </li>
            </ul>
            <p className="mt-1">Добавьте их на Vercel в Environment Variables и пересоберите сайт. Пошаговая инструкция в README, раздел «YouTube».</p>
          </div>
        )}

        {note && <p className="text-sm text-up">{note}</p>}
        {error && <p className="text-sm text-down">{error}</p>}

        <ul className="divide-y divide-hair rounded-lg border border-line">
          {channels.length === 0 && <li className="px-4 py-3 text-sm text-muted">Каналов пока нет.</li>}
          {channels.map((ch) => (
            <li key={ch.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar account={{ avatar_url: ch.avatar_url, display_name: ch.title, username: ch.handle || "" }} size={34} />
              <div className="min-w-0 flex-1 basis-48">
                <div className="truncate text-sm font-medium text-ink">{ch.title}</div>
                <div className="truncate text-xs text-muted">
                  {ch.handle ? `@${ch.handle}` : ch.id} · {ch.subscribers != null ? `${fmtCompact(ch.subscribers)} подписчиков` : "подписчики скрыты"}
                  {!ch.history_loaded && " · история не загружена"}
                </div>
                {ch.is_own && (
                  <div className={cx("mt-0.5 inline-flex items-center gap-1 text-xs", ch.analytics_linked ? "text-up" : "text-muted")}>
                    {ch.analytics_linked ? (
                      <>
                        <IconCheck width={12} height={12} /> аналитика подключена
                        <button
                          className="ml-1 text-muted underline"
                          onClick={() =>
                            window.confirm("Отключить аналитику этого канала? Собранные данные останутся.") &&
                            run(`unlink-${ch.id}`, async () => {
                              await postJson("/api/yt/channels", { action: "unlink", id: ch.id });
                              onChanged();
                            })
                          }
                        >
                          отключить
                        </button>
                      </>
                    ) : (
                      "аналитика не подключена"
                    )}
                  </div>
                )}
              </div>
              <Segmented
                size="sm"
                value={ch.is_own ? "own" : "rival"}
                onChange={async (v) => {
                  await postJson("/api/yt/channels", { action: "own", id: ch.id, is_own: v === "own" });
                  onChanged();
                }}
                options={[
                  { value: "own", label: "Свой" },
                  { value: "rival", label: "Конкурент" },
                ]}
              />
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-sub">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#2a78d6]"
                  checked={ch.is_active}
                  onChange={async () => {
                    await postJson("/api/yt/channels", { action: "toggle", id: ch.id, is_active: !ch.is_active });
                    onChanged();
                  }}
                />
                Собирать
              </label>
              <div className="flex gap-1">
                <Button variant="ghost" title="Обновить сейчас" disabled={!!busy || !ready} onClick={() => update(ch)}>
                  {busy === `upd-${ch.id}` ? <Spinner /> : <IconRefresh width={15} height={15} />}
                </Button>
                <Button variant="ghost" disabled={!!busy || !ready} onClick={() => history(ch)}>
                  {busy === `hist-${ch.id}` ? <Spinner /> : "История"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={!!busy}
                  onClick={async () => {
                    if (!window.confirm(`Удалить канал «${ch.title}» и всю его статистику?`)) return;
                    await postJson("/api/yt/channels", { action: "remove", id: ch.id });
                    onChanged();
                  }}
                >
                  Удалить
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {ready && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.youtube.com/@channel или @channel"
              className="min-w-0 flex-1 basis-60 rounded-lg border border-line px-3 py-2 text-sm"
            />
            <Segmented
              value={own}
              onChange={setOwn}
              options={[
                { value: "own", label: "Свой" },
                { value: "rival", label: "Конкурент" },
              ]}
            />
            <Button
              variant="primary"
              disabled={!link || !!busy}
              onClick={() =>
                run("add", async () => {
                  const r = await postJson<{ channel: YtChannel }>("/api/yt/channels", { action: "add", link, is_own: own === "own" });
                  setLink("");
                  setNote(`Канал «${r.channel.title}» добавлен. Нажмите «История», чтобы загрузить все видео.`);
                  onChanged();
                })
              }
            >
              {busy === "add" ? <Spinner className="border-white/40 border-t-white" /> : "Добавить"}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted">
          Свои каналы удобнее подключать кнопкой «Подключить аналитику канала»: войдите Google-аккаунтом владельца и выберите канал.
          Google покажет предупреждение «приложение не проверено», нажмите «Дополнительно → Перейти». Конкурентов добавляйте по ссылке.
        </p>

        {progress.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-lg bg-page px-3 py-2 font-mono text-xs leading-relaxed text-sub scrollbar-thin">
            {progress.map((l, i) => (
              <div key={i} className={cx(l.includes("ОШИБКА") && "text-down")}>
                {l}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
