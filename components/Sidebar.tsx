"use client";

import type { ReactNode } from "react";
import type { Account, SyncRun } from "@/lib/types";
import { fmtAgo, fmtCompact } from "@/lib/format";
import { Avatar, cx } from "./ui";
import {
  IconAudience,
  IconClose,
  IconCompare,
  IconLogout,
  IconOverview,
  IconPosts,
  IconSettings,
  IconStories,
  LogoMark,
} from "./icons";

export type View = "overview" | "posts" | "stories" | "audience" | "compare" | "settings";

function NavItem({
  active,
  onClick,
  icon,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
        active ? "bg-accent-soft text-accent font-medium" : "text-sub hover:bg-page hover:text-ink",
        disabled && "opacity-40 pointer-events-none"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Sidebar({
  accounts,
  accountId,
  view,
  lastRun,
  open,
  onClose,
  onSelect,
}: {
  accounts: Account[];
  accountId: string;
  view: View;
  lastRun: SyncRun | null;
  open: boolean;
  onClose: () => void;
  onSelect: (next: { a?: string; v?: View }) => void;
}) {
  const all = accountId === "all";
  const go = (next: { a?: string; v?: View }) => {
    onSelect(next);
    onClose();
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={onClose} />}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-line bg-card transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold text-ink">Статистика</div>
              <div className="text-xs text-muted">Instagram</div>
            </div>
          </div>
          <button className="lg:hidden text-muted p-1" onClick={onClose} aria-label="Закрыть меню">
            <IconClose />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
          <p className="px-3 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted">Аккаунты</p>
          <NavItem
            active={all}
            onClick={() => go({ a: "all", v: view === "audience" || view === "overview" ? "compare" : view === "settings" ? "compare" : view })}
            icon={<IconCompare />}
          >
            Все аккаунты
          </NavItem>
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() =>
                go({ a: a.id, v: view === "compare" || view === "settings" ? "overview" : view })
              }
              className={cx(
                "mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition",
                accountId === a.id ? "bg-accent-soft" : "hover:bg-page"
              )}
            >
              <Avatar account={a} size={30} />
              <span className="min-w-0">
                <span className={cx("block truncate text-sm", accountId === a.id ? "font-medium text-accent" : "text-ink")}>
                  {a.display_name}
                </span>
                <span className="block truncate text-xs text-muted">
                  {a.followers_count != null ? `${fmtCompact(a.followers_count)} подписчиков` : `@${a.username}`}
                </span>
              </span>
            </button>
          ))}

          <p className="px-3 pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-wide text-muted">Разделы</p>
          {all ? (
            <NavItem active={view === "compare"} onClick={() => go({ v: "compare" })} icon={<IconCompare />}>
              Сравнение
            </NavItem>
          ) : (
            <NavItem active={view === "overview"} onClick={() => go({ v: "overview" })} icon={<IconOverview />}>
              Обзор
            </NavItem>
          )}
          <NavItem active={view === "posts"} onClick={() => go({ v: "posts" })} icon={<IconPosts />}>
            Публикации
          </NavItem>
          <NavItem active={view === "stories"} onClick={() => go({ v: "stories" })} icon={<IconStories />}>
            Stories
          </NavItem>
          <NavItem active={view === "audience"} onClick={() => go({ v: "audience" })} icon={<IconAudience />} disabled={all}>
            Аудитория
          </NavItem>
        </div>

        <div className="border-t border-line px-3 py-3">
          <NavItem active={view === "settings"} onClick={() => go({ v: "settings" })} icon={<IconSettings />}>
            Настройки
          </NavItem>
          <NavItem
            active={false}
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            icon={<IconLogout />}
          >
            Выйти
          </NavItem>
          <p className="px-3 pt-2 text-xs text-muted">
            Данные обновлены {fmtAgo(lastRun?.finished_at || lastRun?.started_at)}
            {lastRun && lastRun.ok === false && <span className="text-down"> · с ошибками</span>}
          </p>
        </div>
      </aside>
    </>
  );
}
