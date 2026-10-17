"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Account, SyncRun } from "@/lib/types";
import { resolvePeriod, type PresetId } from "@/lib/period";
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
import { ReportDialog } from "@/components/ReportDialog";
import { PostModal } from "@/components/PostModal";

export type Ctx = {
  accounts: Account[];
  account: Account | null; // null = все аккаунты
  accountId: string;
  from: string;
  to: string;
  colorFor: (id: string) => string;
  openPost: (id: string) => void;
  reloadAccounts: () => void;
};

const TITLES: Record<View, string> = {
  overview: "Обзор",
  posts: "Публикации",
  stories: "Stories",
  audience: "Аудитория",
  compare: "Сравнение аккаунтов",
  settings: "Настройки",
};

function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const accountsQ = useApi<{ accounts: Account[]; lastRun: SyncRun | null }>("/api/accounts");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);

  const allAccounts = accountsQ.data?.accounts || [];
  const accounts = useMemo(() => allAccounts.filter((a) => a.is_active !== false), [allAccounts]);

  const accountParam = params.get("a");
  const accountId =
    accountParam === "all" || accounts.some((a) => a.id === accountParam)
      ? (accountParam as string)
      : accounts[0]?.id || "all";
  const account = accounts.find((a) => a.id === accountId) || null;

  let view = (params.get("v") as View) || (account ? "overview" : "compare");
  if (!account && (view === "overview" || view === "audience")) view = "compare";
  if (account && view === "compare") view = "overview";

  const period = resolvePeriod(params.get("p"), params.get("from"), params.get("to"));

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

  const ctx: Ctx = {
    accounts,
    account,
    accountId,
    from: period.from,
    to: period.to,
    colorFor,
    openPost: setPostId,
    reloadAccounts: accountsQ.reload,
  };

  if (accountsQ.error && !accountsQ.data) {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-10">
        <ErrorNote error={accountsQ.error} />
        <p className="text-sm text-sub mt-3">
          Если вы только что обновили сайт, проверьте, что файл supabase/schema.sql выполнен в Supabase (инструкция в README).
        </p>
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

  return (
    <div className="min-h-screen lg:pl-[248px]">
      <Sidebar
        accounts={accounts}
        accountId={accountId}
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
            <h1 className="truncate text-lg font-semibold text-ink">{TITLES[view]}</h1>
            <p className="truncate text-xs text-muted">
              {account ? `${account.display_name} · @${account.username}` : `Все аккаунты · ${accounts.length}`}
            </p>
          </div>
          {view !== "settings" && (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <PeriodPicker
                preset={period.preset}
                from={period.from}
                to={period.to}
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

      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        {accounts.length === 0 && view !== "settings" ? (
          <div className="rounded-xl border border-line bg-card p-6 text-sm text-sub">
            Нет отслеживаемых аккаунтов. Подключите их в разделе{" "}
            <button className="text-accent underline" onClick={() => update({ v: "settings" })}>
              «Настройки»
            </button>
            .
          </div>
        ) : view === "overview" ? (
          <OverviewView ctx={ctx} />
        ) : view === "posts" ? (
          <PostsView ctx={ctx} />
        ) : view === "stories" ? (
          <StoriesView ctx={ctx} onOpenSettings={() => update({ v: "settings" })} />
        ) : view === "audience" ? (
          <AudienceView ctx={ctx} />
        ) : view === "compare" ? (
          <CompareView ctx={ctx} onOpenAccount={(id) => update({ a: id, v: "overview" })} />
        ) : (
          <SettingsView ctx={ctx} allAccounts={allAccounts} />
        )}
      </main>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        accounts={accounts}
        defaultAccountId={accountId}
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
