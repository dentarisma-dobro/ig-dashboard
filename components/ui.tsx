"use client";

import { useEffect, type ReactNode } from "react";
import { fmtNum, fmtPct, pctChange } from "@/lib/format";
import { KIND_LABEL, type PostKind } from "@/lib/metrics";
import type { Account } from "@/lib/types";
import {
  IconArrowDown,
  IconArrowUp,
  IconCarousel,
  IconClose,
  IconInfo,
  IconPhoto,
  IconReels,
} from "./icons";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("bg-card border border-line rounded-xl min-w-0", className)}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-dark border border-accent",
    secondary: "bg-card text-ink border border-line hover:bg-page",
    ghost: "text-sub hover:text-ink hover:bg-page border border-transparent",
    danger: "bg-card text-down border border-line hover:bg-red-50",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed",
        styles,
        className
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex flex-wrap bg-page border border-line rounded-lg p-0.5 gap-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md font-medium transition whitespace-nowrap",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "bg-card text-ink shadow-sm" : "text-sub hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Изменение к прошлому периоду: стрелка + знак + процент, цвет по смыслу (рост хорошо или плохо)
export function Delta({
  cur,
  prev,
  invert = false,
  mode = "pct",
  emptyText = "нет данных для сравнения",
}: {
  cur: number | null | undefined;
  prev: number | null | undefined;
  invert?: boolean;
  mode?: "pct" | "pp";
  emptyText?: string;
}) {
  const change = mode === "pp" ? (cur != null && prev != null ? cur - prev : null) : pctChange(cur, prev);
  if (change == null || !Number.isFinite(change)) {
    return emptyText ? <span className="text-xs text-muted">{emptyText}</span> : null;
  }
  const rounded = Math.round(change * 10) / 10;
  if (rounded === 0) return <span className="text-xs text-muted">без изменений</span>;
  const good = invert ? rounded < 0 : rounded > 0;
  const Arrow = rounded > 0 ? IconArrowUp : IconArrowDown;
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-up" : "text-down")}>
      <Arrow width={12} height={12} strokeWidth={2.25} />
      {rounded > 0 ? "+" : "−"}
      {mode === "pp" ? `${fmtNum(Math.abs(rounded), 1)} п.п.` : fmtPct(Math.abs(rounded))}
    </span>
  );
}

export function KpiTile({
  label,
  value,
  sub,
  delta,
  hint,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="bg-card border border-line rounded-xl px-4 py-3.5 min-w-0">
      <div className="flex items-center gap-1 text-[13px] text-sub">
        <span className="truncate">{label}</span>
        {hint && <InfoHint text={hint} />}
      </div>
      <div className="text-2xl font-semibold text-ink mt-1 leading-tight">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
      {delta && <div className="mt-1.5">{delta}</div>}
    </div>
  );
}

export function InfoHint({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex">
      <IconInfo width={14} height={14} className="text-muted cursor-help" tabIndex={0} />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden w-56 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs font-normal leading-snug text-white shadow-pop group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent/30 border-t-accent", className)}
      aria-label="Загрузка"
    />
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted max-w-md mx-auto">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  const schema = /schema cache|does not exist|column/i.test(error);
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-down">
      Не удалось загрузить данные: {error}
      {schema && (
        <p className="mt-1 text-sub">
          Похоже, база не обновлена: выполните файл supabase/schema.sql в Supabase (SQL Editor → Run).
        </p>
      )}
    </div>
  );
}

export function Avatar({ account, size = 32 }: { account: Pick<Account, "avatar_url" | "display_name" | "username">; size?: number }) {
  const letter = (account.display_name || account.username || "?").slice(0, 1).toUpperCase();
  if (account.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={account.avatar_url}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover bg-page shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="rounded-full bg-accent-soft text-accent font-semibold inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}

export function KindBadge({ kind, className }: { kind: PostKind; className?: string }) {
  const Icon = kind === "reels" || kind === "video" ? IconReels : kind === "carousel" ? IconCarousel : IconPhoto;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md bg-ink/75 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur",
        className
      )}
    >
      <Icon width={12} height={12} />
      {KIND_LABEL[kind]}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:p-8" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx("w-full bg-card rounded-2xl shadow-pop my-auto", wide ? "max-w-4xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold text-ink min-w-0 truncate">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink p-1 -mr-1 rounded" aria-label="Закрыть">
            <IconClose />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Thumb({ src, alt, className }: { src: string | null | undefined; alt?: string; className?: string }) {
  if (!src) {
    return (
      <div className={cx("bg-page flex items-center justify-center text-muted", className)}>
        <IconPhoto width={22} height={22} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt || ""} loading="lazy" className={cx("object-cover bg-page", className)} />
  );
}
