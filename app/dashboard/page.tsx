"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Account, SyncRun, TgChannel, TgSession, YtChannel } from "@/lib/types";
import { resolvePeriod } from "@/lib/period";
import { dateInTz, lastCompleteMetaDay, LOCAL_TZ } from "@/lib/dates";
import { useApi } from "@/components/useApi";
import { Sidebar, type View } from "@/components/Sidebar";
import { PeriodPicker } from "@/components/PeriodPicker";
import { Button, ErrorNote, Spinner } from "@/components/ui";
import { IconDownload, IconMenu } from "@/components/icons";
import { SERIES } from "@/components/charts";
import { OverviewView } from "@/components/views/OverviewView";
import { PostsView } from "@/components/views/PostsView";
import { StoriesView } from "@/components/views/StoriesView";
import { AudienceView } from "@/components/views/AudienceView";
import { CompareView } from "@/components/views/CompareView";
import { SettingsView } from "@/components/views/SettingsView";
import { TgOverviewView } from "@/components/views/TgOverviewView";
import { TgPostsView } from "@/components/views/TgPostsView";
import { TgCompareView } from "@/components/views/TgCompareView";
import { YtOverviewView } from "@/components/views/YtOverviewView";
import { YtVideosView } from "@/components/views/YtVideosView";
import { YtCompareView } from "@/components/views/YtCompareView";
import { ReportDialog } from "@/components/ReportDialog";
import { PostModal } from "@/components/PostModal";
import { YtVideoModal } from "@/components/YtVideoModal";

export type Ctx = {
  accounts: Account[];
  account: Account | null; // null = все аккаунты Instagram
  accountId: string;
  tgChannels: TgChannel[];
  tgChannel: TgChannel | null; // выбранный Telegram-канал
  ytChannels: YtChannel[];
  ytChannel: YtChannel | null; // выбранный YouTube-канал
  from: string;
  to: string;
  colorFor: (id: string) => string;
  tgColorFor: (id: string) => string;
  ytColorFor: (id: string) => string;
  openPost: (id: string) => void;
  reloadAccounts: () => void;
  reloadTg: () => void;
  reloadYt: () => void;
};

export type Source = "ig" | "tg" | "yt";

const TITLES: Record<View, string> = {
  overview: "Обзор",
  posts: "Публикации",
  stories: "Stories",
  audience: "Аудитория",
  compare: "Сравнение",
  settings: "Настройки",
};

function paletteFor(list: { id: string }[]) {
  return (id: string) => {
    const i = list.findIndex((c) => c.id === id);
    return i >= 0 && i < SERIES.length ? SERIES[i] : "#8a929e";
  };
}

function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const accountsQ = useApi<{ accounts: Account[]; lastRun: SyncRun | null }>("/api/accounts");
  const tgQ = useApi<{ channels: TgChannel[]; session: TgSession }>("/api/tg/channels");
  const ytQ = useApi<{ channels: YtChannel[]; status: { apiKey: boolean; oauth: boolean } }>("/api/yt/channels");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);

  const allAccounts = accountsQ.data?.accounts || [];
  const accounts = useMemo(() => allAccounts.filter((a) => a.is_active !== false), [allAccounts]);
  const allTg = tgQ.data?.channels || [];
  const tgChannels = useMemo(() => allTg.filter((c) => c.is_active), [allTg]);
  const allYt = ytQ.data?.channels || [];
  const ytChannels = useMemo(() => allYt.filter((c) => c.is_active), [allYt]);

  // Что выбрано в меню: аккаунт Instagram или "all", "tg:<id>" или "tg:all", "yt:<id>" или "yt:all"
  const sel = params.get("a");
  const valid =
    sel === "all" ||
    sel === "tg:all" ||
    sel === "yt:all" ||
    accounts.some((a) => a.id === sel) ||
    tgChannels.some((c) => `tg:${c.id}` === sel) ||
    ytChannels.some((c) => `yt:${c.id}` === sel);
  const selection = valid ? (sel as string) : accounts[0]?.id || (tgChannels[0] ? `tg:${tgChannels[0].id}` : "all");
  const source: Source = selection.startsWith("tg:") ? "tg" : selection.startsWith("yt:") ? "yt" : "ig";
  const account = source === "ig" ? accounts.find((a) => a.id === selection) || null : null;
  const tgChannel = source === "tg" ? tgChannels.find((c) => `tg:${c.id}` === selection) || null : null;
  const ytChannel = source === "yt" ? ytChannels.find((c) => `yt:${c.id}` === selection) || null : null;
  const single = !!(account || tgChannel || ytChannel);

  let view = (params.get("v") as View) || (single ? "overview" : "compare");
  if (view !== "settings") {
    if (!single && (view === "overview" || view === "audience")) view = "compare";
    if (single && view === "compare") view = "overview";
    if (source !== "ig" && (view === "stories" || view === "audience")) view = single ? "overview" : "compare";
  }

  // Instagram отдаёт сутки после их завершения, Telegram и YouTube показываем по сегодняшний день
  const lastDay = source === "ig" ? lastCompleteMetaDay() : dateInTz(new Date(), LOCAL_TZ);
  const period = resolvePeriod(params.get("p"), params.get("from"), params.get("to"), lastDay);

  const update = useCallback(
    // undefined — не менять параметр, null — убрать его
    (next: Record<string, string | null | undefined>) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined) continue;
        if (v === null) q.delete(k);
        else q.set(k, v);
      }
      if (q.get("p") !== "custom") {
        q.delete("from");
        q.delete("to");
      }
      q.delete("yt");
      q.delete("msg");
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const colorFor = useMemo(() => paletteFor(allAccounts), [allAccounts]);
  const tgColorFor = useMemo(() => paletteFor(allTg), [allTg]);
  const ytColorFor = useMemo(() => paletteFor(allYt), [allYt]);

  const ctx: Ctx = {
    accounts,
    account,
    accountId: source === "ig" ? selection : "all",
    tgChannels,
    tgChannel,
    ytChannels,
    ytChannel,
    from: period.from,
    to: period.to,
    colorFor,
    tgColorFor,
    ytColorFor,
    openPost: setPostId,
    reloadAccounts: accountsQ.reload,
    reloadTg: tgQ.reload,
    reloadYt: ytQ.reload,
  };

  if (accountsQ.error && !accountsQ.data) {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-10">
        <ErrorNote error={accountsQ.error} />
      </div>
    );
  }

  if (!accountsQ.data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const subtitle =
    source === "tg"
      ? tgChannel
        ? `Telegram · ${tgChannel.title}${tgChannel.username ? ` · @${tgChannel.username}` : ""}`
        : `Telegram · все каналы · ${tgChannels.length}`
      : source === "yt"
        ? ytChannel
          ? `YouTube · ${ytChannel.title}${ytChannel.handle ? ` · @${ytChannel.handle}` : ""}`
          : `YouTube · все каналы · ${ytChannels.length}`
        : account
          ? `${account.display_name} · @${account.username}`
          : `Instagram · все аккаунты · ${accounts.length}`;

  const openSettings = () => update({ v: "settings" });
  const emptySource = (name: string) => (
    <div className="rounded-xl border border-line bg-card p-6 text-sm text-sub">
      {name} не подключены. Добавьте их в разделе{" "}
      <button className="text-accent underline" onClick={openSettings}>
        «Настройки»
      </button>
      .
    </div>
  );

  let content: React.ReactNode;
  if (view === "settings") {
    content = (
      <SettingsView
        ctx={ctx}
        allAccounts={allAccounts}
        tgChannels={allTg}
        tgSession={tgQ.data?.session || null}
        ytChannels={allYt}
        ytStatus={ytQ.data?.status || null}
      />
    );
  } else if (source === "tg") {
    if (tgChannels.length === 0) content = emptySource("Telegram-каналы");
    else if (view === "posts") content = <TgPostsView ctx={ctx} />;
    else if (tgChannel) content = <TgOverviewView ctx={ctx} onOpenSettings={openSettings} />;
    else content = <TgCompareView ctx={ctx} onOpenChannel={(id) => update({ a: `tg:${id}`, v: "overview" })} />;
  } else if (source === "yt") {
    if (ytChannels.length === 0) content = emptySource("YouTube-каналы");
    else if (view === "posts") content = <YtVideosView ctx={ctx} onOpenVideo={setVideoId} />;
    else if (ytChannel) content = <YtOverviewView ctx={ctx} onOpenVideo={setVideoId} onOpenSettings={openSettings} />;
    else content = <YtCompareView ctx={ctx} onOpenChannel={(id) => update({ a: `yt:${id}`, v: "overview" })} />;
  } else if (accounts.length === 0) {
    content = emptySource("Аккаунты Instagram");
  } else if (view === "overview") content = <OverviewView ctx={ctx} />;
  else if (view === "posts") content = <PostsView ctx={ctx} />;
  else if (view === "stories") content = <StoriesView ctx={ctx} onOpenSettings={openSettings} />;
  else if (view === "audience") content = <AudienceView ctx={ctx} />;
  else content = <CompareView ctx={ctx} onOpenAccount={(id) => update({ a: id, v: "overview" })} />;

  const title = view === "posts" && source === "tg" ? "Посты" : view === "posts" && source === "yt" ? "Видео" : TITLES[view];

  return (
    <div className="min-h-screen lg:pl-[248px]">
      <Sidebar
        accounts={accounts}
        tgChannels={tgChannels}
        ytChannels={ytChannels}
        selection={selection}
        view={view}
        lastRun={accountsQ.data.lastRun}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSelect={(n) => update({ a: n.a, v: n.v })}
      />

      <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <button className="lg:hidden -ml-1 p-1 text-sub" onClick={() => setMenuOpen(true)} aria-label="Меню">
            <IconMenu width={22} height={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-ink">{title}</h1>
            <p className="truncate text-xs text-muted">{view === "settings" ? "Аккаунты, каналы и сбор статистики" : subtitle}</p>
          </div>
          {view !== "settings" && (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <PeriodPicker preset={period.preset} from={period.from} to={period.to} max={lastDay} onChange={({ p, from, to }) => update({ p, from, to })} />
              <Button variant="primary" onClick={() => setReportOpen(true)}>
                <IconDownload width={16} height={16} />
                <span className="hidden sm:inline">Отчёт</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">{content}</main>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        accounts={accounts}
        tgChannels={tgChannels}
        ytChannels={ytChannels}
        defaultSelection={selection}
        from={period.from}
        to={period.to}
      />
      <PostModal postId={postId} onClose={() => setPostId(null)} ctx={ctx} />
      <YtVideoModal videoId={videoId} onClose={() => setVideoId(null)} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
