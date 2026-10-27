"use client";

import type { ReactNode } from "react";
import type { Account, SyncRun, TgChannel } from "@/lib/types";
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

function SourceItem({
  active,
  onClick,
  avatar,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  avatar: ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx("mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition", active ? "bg-accent-soft" : "hover:bg-page")}
    >
      {avatar}
      <span className="min-w-0">
        <span className={cx("block truncate text-sm", active ? "font-medium text-accent" : "text-ink")}>{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
    </button>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <p className="px-3 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted">{children}</p>
);

export function Sidebar({
  accounts,
  tgChannels,
  selection,
  view,
  lastRun,
  open,
  onClose,
  onSelect,
}: {
  accounts: Account[];
  tgChannels: TgChannel[];
  selection: string;
  view: View;
  lastRun: SyncRun | null;
  open: boolean;
  onClose: () => void;
  onSelect: (next: { a?: string; v?: View }) => void;
}) {
  const isTg = selection.startsWith("tg:");
  const single = selection !== "all" && selection !== "tg:all";
  const go = (next: { a?: string; v?: View }) => {
    onSelect(next);
    onClose();
  };
  // При переключении источника сохраняем раздел, если он там есть
  const keep = (toTg: boolean, toSingle: boolean): View => {
    if (view === "posts") return "posts";
    if (!toTg && (view === "stories" || (view === "audience" && toSingle))) return view;
    return toSingle ? "overview" : "compare";
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
        <div className="flex items-center justify-between px-4 pt-4 pb-1">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold text-ink">Статистика</div>
              <div className="text-xs text-muted">Instagram и Telegram</div>
            </div>
          </div>
          <button className="lg:hidden text-muted p-1" onClick={onClose} aria-label="Закрыть меню">
            <IconClose />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
          <Label>Instagram</Label>
          <NavItem active={selection === "all"} onClick={() => go({ a: "all", v: keep(false, false) })} icon={<IconCompare />}>
            Все аккаунты
          </NavItem>
          {accounts.map((a) => (
            <SourceItem
              key={a.id}
              active={selection === a.id}
              onClick={() => go({ a: a.id, v: keep(false, true) })}
              avatar={<Avatar account={a} size={30} />}
              title={a.display_name}
              sub={a.followers_count != null ? `${fmtCompact(a.followers_count)} подписчиков` : `@${a.username}`}
            />
          ))}

          <Label>Telegram</Label>
          <NavItem active={selection === "tg:all"} onClick={() => go({ a: "tg:all", v: keep(true, false) })} icon={<IconCompare />}>
            Все каналы
          </NavItem>
          {tgChannels.map((c) => (
            <SourceItem
              key={c.id}
              active={selection === `tg:${c.id}`}
              onClick={() => go({ a: `tg:${c.id}`, v: keep(true, true) })}
              avatar={<Avatar account={{ avatar_url: c.avatar_url, display_name: c.title, username: c.username || "" }} size={30} />}
              title={c.title}
              sub={`${c.subscribers != null ? `${fmtCompact(c.subscribers)} подп.` : ""}${c.is_own ? "" : " · конкурент"}`}
            />
          ))}
          {tgChannels.length === 0 && (
            <button onClick={() => go({ v: "settings" })} className="px-3 py-1.5 text-left text-xs text-accent hover:underline">
              Подключить каналы
            </button>
          )}

          <Label>Разделы</Label>
          {single ? (
            <NavItem active={view === "overview"} onClick={() => go({ v: "overview" })} icon={<IconOverview />}>
              Обзор
            </NavItem>
          ) : (
            <NavItem active={view === "compare"} onClick={() => go({ v: "compare" })} icon={<IconCompare />}>
              Сравнение
            </NavItem>
          )}
          <NavItem active={view === "posts"} onClick={() => go({ v: "posts" })} icon={<IconPosts />}>
            {isTg ? "Посты" : "Публикации"}
          </NavItem>
          {!isTg && (
            <>
              <NavItem active={view === "stories"} onClick={() => go({ v: "stories" })} icon={<IconStories />}>
                Stories
              </NavItem>
              <NavItem active={view === "audience"} onClick={() => go({ v: "audience" })} icon={<IconAudience />} disabled={!single}>
                Аудитория
              </NavItem>
            </>
          )}
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
