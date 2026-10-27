"use client";

import { useState } from "react";
import type { TgChannel, TgSession } from "@/lib/types";
import { fmtCompact } from "@/lib/format";
import { postJson } from "../useApi";
import { Avatar, Button, Card, CardHeader, Segmented, Spinner, cx } from "../ui";
import { IconRefresh } from "../icons";

export function TelegramSettings({
  session,
  channels,
  onChanged,
}: {
  session: TgSession | null;
  channels: TgChannel[];
  onChanged: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [link, setLink] = useState("");
  const [own, setOwn] = useState<"own" | "rival">("rival");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [showHow, setShowHow] = useState(false);

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

  const login = (action: string, payload: Record<string, string>) =>
    run(action, async () => {
      const r = await postJson<any>("/api/tg/session", { action, ...payload });
      if (action === "start") setNote(r.viaApp ? "Код отправлен в приложение Telegram на этом номере" : "Код отправлен по SMS");
      if (r.needPassword) setNote("На аккаунте включён облачный пароль, введите его");
      if (r.ok && r.userName) setNote(`Аккаунт подключён: ${r.userName}`);
      onChanged();
    });

  async function history(ch: TgChannel) {
    await run(`hist-${ch.id}`, async () => {
      let cursor: number | null = null;
      let total = 0;
      setProgress([`${ch.title}: загружаем историю…`]);
      do {
        const r: { processed: number; nextCursor: number | null } = await postJson("/api/tg/sync", { channel: ch.id, action: "history", cursor });
        total += r.processed;
        cursor = r.nextCursor;
        setProgress((p) => [...p, `${ch.title}: постов загружено ${total}`]);
      } while (cursor);
      setProgress((p) => [...p, `${ch.title}: история загружена`]);
      onChanged();
    });
  }

  async function update(ch: TgChannel) {
    await run(`upd-${ch.id}`, async () => {
      const r = await postJson<{ log: string[] }>("/api/tg/sync", { channel: ch.id, action: "update" });
      setProgress(r.log);
      onChanged();
    });
  }

  if (!session) return null;
  const connected = session.connected;

  return (
    <Card className="xl:col-span-2">
      <CardHeader title="Telegram-каналы" subtitle="Свои каналы и конкуренты" />
      <div className="space-y-5 border-t border-line px-5 py-4">
        {/* Режим сбора */}
        <div className="rounded-lg bg-page px-4 py-3 text-[13px]">
          {connected ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-up" />
              <span className="text-ink">
                Полный режим: аккаунт {session.userName} {session.phone && <span className="text-muted">({session.phone})</span>}
              </span>
              <Button variant="ghost" onClick={() => window.confirm("Выйти из аккаунта Telegram? Сайт вернётся к публичным страницам каналов.") && login("logout", {})}>
                Выйти
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-ink">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" />
                Режим без ключей: сайт читает публичные страницы каналов.
              </p>
              <p className="text-sub">
                Видны подписчики, посты, просмотры и реакции. Репосты, комментарии, подписки и отписки, источники просмотров и точные
                просмотры больше тысячи появятся после подключения аккаунта Telegram.
              </p>
              {session.configured ? (
                <div className="max-w-md space-y-2 pt-1">
                  {session.pending === "code" ? (
                    <div className="flex gap-2">
                      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код из Telegram" inputMode="numeric" className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm" />
                      <Button variant="primary" disabled={!code || !!busy} onClick={() => login("code", { code })}>
                        {busy === "code" ? <Spinner className="border-white/40 border-t-white" /> : "Войти"}
                      </Button>
                    </div>
                  ) : session.pending === "password" ? (
                    <div className="flex gap-2">
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Облачный пароль" className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm" />
                      <Button variant="primary" disabled={!password || !!busy} onClick={() => login("password", { password })}>
                        {busy === "password" ? <Spinner className="border-white/40 border-t-white" /> : "Войти"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+79991234567" inputMode="tel" className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm" />
                      <Button variant="primary" disabled={!phone || !!busy} onClick={() => login("start", { phone })}>
                        {busy === "start" ? <Spinner className="border-white/40 border-t-white" /> : "Подключить аккаунт"}
                      </Button>
                    </div>
                  )}
                  {session.pending && (
                    <button className="text-xs text-sub underline" onClick={() => login("logout", {})}>
                      Начать заново
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <button className="text-xs text-accent underline" onClick={() => setShowHow((s) => !s)}>
                    Как включить полный режим
                  </button>
                  {showHow && (
                    <ol className="list-decimal space-y-1 pl-5 text-xs text-sub">
                      <li>На my.telegram.org → API development tools создайте приложение (платформа «Бот / сервер»).</li>
                      <li>Добавьте App api_id и App api_hash на Vercel как TG_API_ID и TG_API_HASH и пересоберите сайт.</li>
                      <li>Здесь появится вход в аккаунт. Используйте отдельный аккаунт и сделайте его админом своих каналов.</li>
                    </ol>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {note && <p className="text-sm text-up">{note}</p>}
        {error && <p className="text-sm text-down">{error}</p>}

        <ul className="divide-y divide-hair rounded-lg border border-line">
          {channels.length === 0 && <li className="px-4 py-3 text-sm text-muted">Каналов пока нет. Добавьте первый ниже.</li>}
          {channels.map((ch) => (
            <li key={ch.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar account={{ avatar_url: ch.avatar_url, display_name: ch.title, username: ch.username || "" }} size={34} />
              <div className="min-w-0 flex-1 basis-48">
                <div className="truncate text-sm font-medium text-ink">{ch.title}</div>
                <div className="truncate text-xs text-muted">
                  {ch.username ? `@${ch.username}` : "без username"} · {ch.subscribers != null ? `${fmtCompact(ch.subscribers)} подписчиков` : "?"}
                  {connected && ch.is_own && (ch.stats_available ? " · статистика Telegram есть" : " · статистики Telegram нет: аккаунт не админ")}
                  {!ch.history_loaded && " · история не загружена"}
                </div>
              </div>
              <Segmented
                size="sm"
                value={ch.is_own ? "own" : "rival"}
                onChange={async (v) => {
                  await postJson("/api/tg/channels", { action: "own", id: ch.id, is_own: v === "own" });
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
                    await postJson("/api/tg/channels", { action: "toggle", id: ch.id, is_active: !ch.is_active });
                    onChanged();
                  }}
                />
                Собирать
              </label>
              <div className="flex gap-1">
                <Button variant="ghost" title="Обновить сейчас" disabled={!!busy} onClick={() => update(ch)}>
                  {busy === `upd-${ch.id}` ? <Spinner /> : <IconRefresh width={15} height={15} />}
                </Button>
                <Button variant="ghost" disabled={!!busy} onClick={() => history(ch)}>
                  {busy === `hist-${ch.id}` ? <Spinner /> : "История"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={!!busy}
                  onClick={async () => {
                    if (!window.confirm(`Удалить канал «${ch.title}» и всю его статистику?`)) return;
                    await postJson("/api/tg/channels", { action: "remove", id: ch.id });
                    onChanged();
                  }}
                >
                  Удалить
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://t.me/channel или @channel"
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
                const r = await postJson<{ channel: TgChannel }>("/api/tg/channels", { action: "add", link, is_own: own === "own" });
                setLink("");
                setNote(`Канал «${r.channel.title}» добавлен. Нажмите «История», чтобы подтянуть старые посты.`);
                onChanged();
              })
            }
          >
            {busy === "add" ? <Spinner className="border-white/40 border-t-white" /> : "Добавить"}
          </Button>
        </div>
        <p className="text-xs text-muted">
          Добавлять можно любые публичные каналы, подписываться не нужно. Число подписчиков в прошлом Telegram не показывает, его
          история копится со дня добавления. Посты и их просмотры подтянутся за всё время кнопкой «История».
        </p>

        {progress.length > 0 && (
          <div className={cx("max-h-40 overflow-y-auto rounded-lg bg-page px-3 py-2 font-mono text-xs leading-relaxed text-sub scrollbar-thin")}>
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
