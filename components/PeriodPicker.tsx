"use client";

import { useEffect, useRef, useState } from "react";
import { PRESETS, type PresetId } from "@/lib/period";
import { fmtRange } from "@/lib/format";
import { lastCompleteMetaDay } from "@/lib/dates";
import { IconCalendar, IconCheck, IconChevronDown } from "./icons";
import { Button, cx } from "./ui";

export function PeriodPicker({
  preset,
  from,
  to,
  onChange,
}: {
  preset: PresetId;
  from: string;
  to: string;
  onChange: (p: { p: PresetId; from?: string; to?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cFrom, setCFrom] = useState(from);
  const [cTo, setCTo] = useState(to);
  const ref = useRef<HTMLDivElement>(null);
  const max = lastCompleteMetaDay();

  useEffect(() => {
    setCFrom(from);
    setCTo(to);
  }, [from, to]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="relative min-w-0 flex-1 sm:flex-none" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex w-full items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink hover:bg-page"
        aria-expanded={open}
      >
        <IconCalendar width={16} height={16} className="text-sub" />
        <span className="min-w-0 flex-1 truncate text-left">{fmtRange(from, to)}</span>
        <IconChevronDown width={16} height={16} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-card p-1.5 shadow-pop sm:left-auto sm:right-0">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onChange({ p: p.id });
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-page"
            >
              {p.label}
              {preset === p.id && <IconCheck width={16} height={16} strokeWidth={2.5} className="text-accent" />}
            </button>
          ))}
          <div className="mt-1 border-t border-line px-3 pb-2 pt-3">
            <p className={cx("mb-2 text-xs font-medium", preset === "custom" ? "text-accent" : "text-sub")}>Свой период</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={cFrom}
                max={max}
                onChange={(e) => setCFrom(e.target.value)}
                className="w-full rounded-md border border-line px-2 py-1.5 text-sm"
              />
              <span className="text-muted">–</span>
              <input
                type="date"
                value={cTo}
                max={max}
                onChange={(e) => setCTo(e.target.value)}
                className="w-full rounded-md border border-line px-2 py-1.5 text-sm"
              />
            </div>
            <Button
              variant="primary"
              className="mt-2 w-full"
              disabled={!cFrom || !cTo}
              onClick={() => {
                onChange({ p: "custom", from: cFrom, to: cTo });
                setOpen(false);
              }}
            >
              Применить
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
