"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Account, SyncRun, TgChannel, TgSession } from "@/lib/types";
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
import { ReportDialog } from "@/components/ReportDialog";
import { PostModal } from "@/components/PostModal";

export type Ctx = {
  accounts: Account[];
  account: Account | null; // null = все аккаунты Instagram
  accountId: string;
  tgChannels: TgChannel[];
  tgChannel: TgChannel | null; // выбранный Telegram-канал
  from: string;
  to: string;
  colorFor: (id: string) => string;
  tgColorFor: (id: string) => string;
  openPost: (id: string) => void;
  reloadAccounts: () => void;
  reloadTg: () => void;
};

const TITLES: Record<View, string> = {
  overview: "Обзор",
  posts: "Публикации",
  stories: "Stories",
  audience: "Аудитория",
  compare: "Сравнение",
  settings: "Настройки",
};

function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const accountsQ = useApi<{ accounts: Account[]; lastRun: SyncRun | null }>("/api/accounts");
  const tgQ = useApi<{ channels: TgChannel[]; session: TgSession }>("/api/tg/channels");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);

  const allAccounts = accountsQ.data?.accounts || [];
  const accounts = useMemo(() => allAccounts.filter((a) => a.is_active !== false), [allAccounts]);
  const allTg = tgQ.data?.channels || [];
  const tgChannels = useMemo(() => allTg.filter((c) => c.is_active), [allTg]);

  // Что выбрано в меню: аккаунт Instagram, "all", "tg:all" или "tg:<id канала>"
  const sel = params.get("a");
  let selection: string;
  if (sel === "all" || sel === "tg:all" || accounts.some((a) => a.id === sel) || tgChannels.some((c) => `tg:${c.id}` === sel)) {
    selection = sel as string;
  } else {
    selection = accounts[0]?.id || (tgChannels[0] ? `tg:${tgChannels[0].id}` : "all");
  }
  const isTg = selection.startsWith("tg:");
  const account = isTg ? null : accounts.find((a) => a.id === selection) || null;
  const tgChannel = isTg ? tgChannels.find((c) => `tg:${c.id}` === selection) || null : null;
  const single = isTg ? !!tgChannel : !!account;

  let view = (params.get("v") as View) || (single ? "overview" : "compare");
  if (view !== "settings") {
    if (!single && (view === "overview" || view === "audience")) view = "compare";
    if (single && view === "compare") view = "overview";
    if (isTg && (view === "stories" || view === "audience")) view = single ? "overview" : "compare";
  }

  const lastDay = isTg ? dateInTz(new Date(), LOCAL_TZ) : lastCompleteMetaDay();
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
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const colorFor = useCallback(
    (id: string) => {
      const i = allAccounts.findIndex((a) => a.id === id);
      return i >= 0 && i < SERIES.length ? SERIES[i] : "#8a929e";
    },
    [allAccounts]
  );
  const tgColorFor = useCallback(
    (id: string) => {
      const i = allTg.findIndex((c) => c.id === id);
      return i >= 0 && i < SERIES.length ? SERIES[i] : "#8a929e";
    },
    [allTg]
  );

  const ctx: Ctx = {
    accounts,
    account,
    accountId: isTg ? "all" : selection,
    tgChannels,
    tgChannel,
    from: period.from,
    to: period.to,
    colorFor,
    tgColorFor,
    openPost: setPostId,
    reloadAccounts: accountsQ.reload,
    reloadTg: tgQ.reload,
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

  const subtitle = isTg
    ? tgChannel
      ? `Telegram · ${tgChannel.title}${tgChannel.username ? ` · @${tgChannel.username}` : ""}`
      : `Telegram · все каналы · ${tgChannels.length}`
    : account
      ? `${account.display_name} · @${account.username}`
      : `Instagram · все аккаунты · ${accounts.length}`;

  const openSettings = () => update({ v: "settings" });
  let content: React.ReactNode;
  if (view === "settings") {
    content = <SettingsView ctx={ctx} allAccounts={allAccounts} tgChannels={allTg} tgSession={tgQ.data?.session || null} />;
  } else if (isTg) {
    if (tgChannels.length === 0) {
      content = (
        <div className="rounded-xl border border-line bg-card p-6 text-sm text-sub">
          Telegram-каналы не подключены. Добавьте их в разделе{" "}
          <button className="text-accent underline" onClick={openSettings}>
            «Настройки»
          </button>
          .
        </div>
      );
    } else if (view === "posts") content = <TgPostsView ctx={ctx} />;
    else if (tgChannel) content = <TgOverviewView ctx={ctx} onOpenSettings={openSettings} />;
    else content = <TgCompareView ctx={ctx} onOpenChannel={(id) => update({ a: `tg:${id}`, v: "overview" })} />;
  } else if (accounts.length === 0) {
    content = (
      <div className="rounded-xl border border-line bg-card p-6 text-sm text-sub">
        Нет отслеживаемых аккаунтов. Подключите их в разделе{" "}
        <button className="text-accent underline" onClick={openSettings}>
          «Настройки»
        </button>
        .
      </div>
    );
  } else if (view === "overview") content = <OverviewView ctx={ctx} />;
  else if (view === "posts") content = <PostsView ctx={ctx} />;
  else if (view === "stories") content = <StoriesView ctx={ctx} onOpenSettings={openSettings} />;
  else if (view === "audience") content = <AudienceView ctx={ctx} />;
  else content = <CompareView ctx={ctx} onOpenAccount={(id) => update({ a: id, v: "overview" })} />;

  return (
    <div className="min-h-screen lg:pl-[248px]">
      <Sidebar
        accounts={accounts}
        tgChannels={tgChannels}
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
            <h1 className="truncate text-lg font-semibold text-ink">
              {view === "posts" && isTg ? "Посты" : TITLES[view]}
            </h1>
            <p className="truncate text-xs text-muted">{view === "settings" ? "Аккаунты, каналы и сбор статистики" : subtitle}</p>
          </div>
          {view !== "settings" && (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <PeriodPicker
                preset={period.preset}
                from={period.from}
                to={period.to}
                max={lastDay}
                onChange={({ p, from, to }) => update({ p, from, to })}
              />
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
        defaultSelection={selection}
        from={period.from}
        to={period.to}
      />
      <PostModal postId={postId} onClose={() => setPostId(null)} ctx={ctx} />
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
