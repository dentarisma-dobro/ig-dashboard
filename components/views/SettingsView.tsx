"use client";

import { useState } from "react";
import type { Ctx } from "@/app/dashboard/page";
import type { Account, SyncRun } from "@/lib/types";
import { fmtAgo, fmtCompact, fmtDateTime } from "@/lib/format";
import { getJson, postJson, useApi } from "../useApi";
import { Avatar, Button, Card, CardHeader, Spinner, cx } from "../ui";
import { IconCheck, IconRefresh, IconUserPlus } from "../icons";

type Available = { id: string; username: string; name?: string; profile_picture_url?: string; followers_count?: number; page_name: string };

export function SettingsView({ ctx, allAccounts }: { ctx: Ctx; allAccounts: Account[] }) {
  const runs = useApi<{ runs: SyncRun[] }>("/api/sync");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [discover, setDiscover] = useState<Available[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<number | null>(null);

  const say = (line: string) => setProgress((p) => [...p, line]);
  const active = allAccounts.filter((a) => a.is_active !== false);

  async function runUpdate() {
    setBusy("update");
    setProgress([]);
    for (const a of active) {
      say(`@${a.username}: обновляем…`);
      try {
        const r = await postJson<{ log: string[] }>("/api/sync", { account: a.id, action: "update" });
        r.log.forEach(say);
      } catch (e: any) {
        say(`@${a.username}: ОШИБКА: ${e.message}`);
      }
    }
    say("Готово");
    setBusy(null);
    runs.reload();
    ctx.reloadAccounts();
  }

  async function runHistory() {
    setBusy("history");
    setProgress([]);
    for (const a of active) {
      try {
        say(`@${a.username}: статистика по дням за 30 дней…`);
        await postJson("/api/sync", { account: a.id, action: "history-daily" });
        let cursor: string | null = null;
        let total = 0;
        do {
          const r: { processed: number; nextCursor: string | null } = await postJson("/api/sync", {
            account: a.id,
            action: "history-media",
            cursor,
          });
          total += r.processed;
          cursor = r.nextCursor;
          say(`@${a.username}: публикаций загружено ${total}`);
        } while (cursor);
      } catch (e: any) {
        say(`@${a.username}: ОШИБКА: ${e.message}`);
      }
    }
    say("Готово: история загружена");
    setBusy(null);
    runs.reload();
    ctx.reloadAccounts();
  }

  async function loadDiscover() {
    setDiscoverError(null);
    try {
      const r = await getJson<{ accounts: Available[] }>("/api/discover");
      setDiscover(r.accounts);
    } catch (e: any) {
      setDiscoverError(e.message);
    }
  }

  async function toggle(a: Account) {
    await postJson("/api/accounts", { action: "toggle", id: a.id, is_active: a.is_active === false });
    ctx.reloadAccounts();
  }

  async function add(id: string) {
    setBusy(`add-${id}`);
    try {
      await postJson("/api/accounts", { action: "add", id });
      ctx.reloadAccounts();
    } catch (e: any) {
      setDiscoverError(e.message);
    }
    setBusy(null);
  }

  async function rename(a: Account) {
    const name = window.prompt("Название аккаунта на сайте", a.display_name);
    if (!name || name === a.display_name) return;
    await postJson("/api/accounts", { action: "rename", id: a.id, display_name: name });
    ctx.reloadAccounts();
  }

  const tracked = new Set(allAccounts.map((a) => a.id));

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Аккаунты"
          subtitle="Сбор статистики идёт только по включённым аккаунтам"
          actions={
            <Button onClick={loadDiscover}>
              <IconUserPlus width={16} height={16} />
              Подключить
            </Button>
          }
        />
        <ul className="divide-y divide-hair border-t border-line">
          {allAccounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar account={a} size={36} />
              <div className="min-w-0 flex-1">
                <button onClick={() => rename(a)} className="block truncate text-sm font-medium text-ink hover:underline" title="Переименовать">
                  {a.display_name}
                </button>
                <div className="truncate text-xs text-muted">
                  @{a.username} · {a.followers_count != null ? `${fmtCompact(a.followers_count)} подписчиков` : "профиль ещё не загружен"} · ID {a.id}
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-sub">
                <input type="checkbox" className="h-4 w-4 accent-[#2a78d6]" checked={a.is_active !== false} onChange={() => toggle(a)} />
                Собирать
              </label>
            </li>
          ))}
        </ul>
        {(discover || discoverError) && (
          <div className="border-t border-line px-5 py-4">
            <p className="mb-2 text-[13px] font-medium text-ink">Аккаунты, доступные токену</p>
            {discoverError && <p className="text-sm text-down">{discoverError}</p>}
            {discover?.length === 0 && <p className="text-sm text-muted">Токен не видит ни одного Instagram-аккаунта.</p>}
            <ul className="space-y-2">
              {discover?.map((d) => (
                <li key={d.id} className="flex items-center gap-3">
                  <Avatar account={{ avatar_url: d.profile_picture_url, display_name: d.name || d.username, username: d.username }} size={30} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate text-ink">@{d.username}</div>
                    <div className="truncate text-xs text-muted">страница «{d.page_name}»</div>
                  </div>
                  {tracked.has(d.id) ? (
                    <span className="inline-flex items-center gap-1 text-xs text-up">
                      <IconCheck width={14} height={14} /> подключён
                    </span>
                  ) : (
                    <Button onClick={() => add(d.id)} disabled={!!busy}>
                      {busy === `add-${d.id}` ? <Spinner /> : "Добавить"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Сбор статистики" subtitle="Автоматически каждый день около 12:00 по Москве" />
        <div className="space-y-3 px-5 pb-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={runUpdate} disabled={!!busy}>
              {busy === "update" ? <Spinner className="border-white/40 border-t-white" /> : <IconRefresh width={16} height={16} />}
              Обновить сейчас
            </Button>
            <Button onClick={runHistory} disabled={!!busy}>
              {busy === "history" && <Spinner />}
              Загрузить историю
            </Button>
          </div>
          <p className="text-xs text-muted">
            «Загрузить историю» подтягивает статистику по дням за последние 30 дней (больше Instagram не хранит) и все публикации
            с обложками. Это занимает несколько минут, не закрывайте вкладку.
          </p>
          {progress.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg bg-page px-3 py-2 font-mono text-xs leading-relaxed text-sub scrollbar-thin">
              {progress.map((l, i) => (
                <div key={i} className={cx(l.includes("ОШИБКА") && "text-down")}>
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-line">
          <p className="px-5 pb-1 pt-3 text-[13px] font-medium text-ink">Журнал сборов</p>
          {runs.data?.runs.length === 0 && <p className="px-5 pb-4 text-sm text-muted">Сборов пока не было.</p>}
          <ul className="pb-2">
            {runs.data?.runs.map((r) => (
              <li key={r.id} className="px-5">
                <button
                  onClick={() => setOpenRun(openRun === r.id ? null : r.id)}
                  className="flex w-full items-center gap-3 py-2 text-left text-[13px]"
                >
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", r.ok ? "bg-up" : r.ok === false ? "bg-down" : "bg-muted")} />
                  <span className="text-ink">{fmtDateTime(r.started_at)}</span>
                  <span className="text-muted">{r.source === "cron" ? "по расписанию" : "вручную"}</span>
                  <span className={cx("ml-auto text-xs", r.ok ? "text-up" : r.ok === false ? "text-down" : "text-muted")}>
                    {r.ok ? "успешно" : r.ok === false ? "с ошибками" : "не завершён"}
                  </span>
                </button>
                {openRun === r.id && (
                  <div className="mb-2 rounded-lg bg-page px-3 py-2 font-mono text-xs leading-relaxed text-sub">
                    {(r.log || []).map((l, i) => (
                      <div key={i} className={cx(l.includes("ОШИБКА") && "text-down")}>
                        {l}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader title="Что важно знать про данные Instagram" />
        <ul className="list-disc space-y-1.5 px-5 pb-5 pl-9 text-[13px] text-sub">
          <li>Статистику по дням (охват, просмотры, посещения профиля, подписки и отписки) Instagram отдаёт только за последние 30 дней. Всё, что старше, копит сам сайт, поэтому ежедневный сбор нельзя отключать.</li>
          <li>Сутки Instagram считает по тихоокеанскому времени: день «16 октября» длится с 10:00 16-го до 10:00 17-го по Москве (зимой с 11:00 до 11:00).</li>
          <li>Число подписчиков за прошлые дни Instagram не хранит. Сайт замеряет его каждый день, а дни до первого замера восстанавливает по подпискам и отпискам.</li>
          <li>Stories доступны только 24 часа, поэтому сайт сохраняет их четыре раза в сутки: около 06:00, 12:00, 18:00 и 00:00 по Москве.</li>
          <li>Аудиторию (пол, возраст, города) Instagram показывает только аккаунтам от 100 подписчиков.</li>
          <li>Последнее обновление профилей: {fmtAgo(allAccounts.map((a) => a.profile_updated_at).filter(Boolean).sort().pop())}.</li>
        </ul>
      </Card>
    </div>
  );
}
