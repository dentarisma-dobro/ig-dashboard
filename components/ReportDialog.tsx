"use client";

import { useEffect, useState } from "react";
import type { Account, TgChannel, YtChannel } from "@/lib/types";
import { fmtRange } from "@/lib/format";
import { Avatar, Button, Modal, Spinner, cx } from "./ui";
import { IconFile, IconTable } from "./icons";

export function ReportDialog({
  open,
  onClose,
  accounts,
  tgChannels,
  ytChannels,
  defaultSelection,
  from,
  to,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  tgChannels: TgChannel[];
  ytChannels: YtChannel[];
  defaultSelection: string;
  from: string;
  to: string;
}) {
  const [igSel, setIgSel] = useState<string[]>([]);
  const [tgSel, setTgSel] = useState<string[]>([]);
  const [ytSel, setYtSel] = useState<string[]>([]);
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const s = defaultSelection;
    setIgSel(s === "all" ? accounts.map((a) => a.id) : accounts.some((a) => a.id === s) ? [s] : []);
    setTgSel(s === "tg:all" ? tgChannels.map((c) => c.id) : s.startsWith("tg:") ? [s.slice(3)] : []);
    setYtSel(s === "yt:all" ? ytChannels.map((c) => c.id) : s.startsWith("yt:") ? [s.slice(3)] : []);
    setError(null);
    setStatus(null);
  }, [open, defaultSelection, accounts, tgChannels, ytChannels]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function download() {
    setError(null);
    try {
      setStatus("Собираем данные…");
      const { loadReportData } = await import("@/lib/report/data");
      const data = await loadReportData(
        accounts.filter((a) => igSel.includes(a.id)),
        tgChannels.filter((c) => tgSel.includes(c.id)),
        ytChannels.filter((c) => ytSel.includes(c.id)),
        from,
        to
      );
      if (format === "pdf") {
        setStatus("Формируем PDF…");
        const { downloadPdfReport } = await import("@/lib/exportPdf");
        await downloadPdfReport(data);
      } else {
        setStatus("Формируем Excel…");
        const { downloadExcelReport } = await import("@/lib/exportExcel");
        await downloadExcelReport(data);
      }
      setStatus(null);
      onClose();
    } catch (e: any) {
      setStatus(null);
      setError(e?.message || String(e));
    }
  }

  const Row = ({ checked, onChange, avatar, title, sub }: { checked: boolean; onChange: () => void; avatar: React.ReactNode; title: string; sub: string }) => (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 hover:bg-page">
      <input type="checkbox" className="h-4 w-4 accent-[#2a78d6]" checked={checked} onChange={onChange} />
      {avatar}
      <span className="min-w-0 truncate text-sm text-ink">{title}</span>
      <span className="truncate text-xs text-muted">{sub}</span>
    </label>
  );

  const total = igSel.length + tgSel.length + ytSel.length;

  return (
    <Modal open={open} onClose={status ? () => {} : onClose} title="Скачать отчёт">
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Период</p>
          <p className="text-sm text-sub">{fmtRange(from, to)}. Сменить можно в шапке страницы.</p>
        </div>

        {accounts.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink">Instagram</p>
            <div className="space-y-1.5">
              {accounts.map((a) => (
                <Row
                  key={a.id}
                  checked={igSel.includes(a.id)}
                  onChange={() => toggle(igSel, setIgSel, a.id)}
                  avatar={<Avatar account={a} size={24} />}
                  title={a.display_name}
                  sub={`@${a.username}`}
                />
              ))}
            </div>
          </div>
        )}

        {tgChannels.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink">Telegram</p>
            <div className="space-y-1.5">
              {tgChannels.map((c) => (
                <Row
                  key={c.id}
                  checked={tgSel.includes(c.id)}
                  onChange={() => toggle(tgSel, setTgSel, c.id)}
                  avatar={<Avatar account={{ avatar_url: c.avatar_url, display_name: c.title, username: c.username || "" }} size={24} />}
                  title={c.title}
                  sub={c.is_own ? "свой" : "конкурент"}
                />
              ))}
            </div>
          </div>
        )}
        {ytChannels.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink">YouTube</p>
            <div className="space-y-1.5">
              {ytChannels.map((c) => (
                <Row
                  key={c.id}
                  checked={ytSel.includes(c.id)}
                  onChange={() => toggle(ytSel, setYtSel, c.id)}
                  avatar={<Avatar account={{ avatar_url: c.avatar_url, display_name: c.title, username: c.handle || "" }} size={24} />}
                  title={c.title}
                  sub={c.is_own ? "свой" : "конкурент"}
                />
              ))}
            </div>
          </div>
        )}
        {(igSel.length > 1 || tgSel.length > 1 || ytSel.length > 1) && (
          <p className="-mt-3 text-xs text-muted">Если выбрано несколько аккаунтов или каналов, в PDF первой будет страница сравнения.</p>
        )}

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Формат</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "pdf" as const, icon: <IconFile />, title: "PDF", text: "Сводка, графики, лучшие посты" },
              { id: "xlsx" as const, icon: <IconTable />, title: "Excel", text: "Все цифры по дням и постам" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={cx("rounded-lg border px-3 py-2.5 text-left transition", format === f.id ? "border-accent bg-accent-soft" : "border-line hover:bg-page")}
              >
                <span className={cx("flex items-center gap-2 text-sm font-medium", format === f.id ? "text-accent" : "text-ink")}>
                  {f.icon}
                  {f.title}
                </span>
                <span className="mt-0.5 block text-xs text-sub">{f.text}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-down">Не получилось: {error}</p>}

        <div className="flex items-center justify-end gap-2">
          {status && (
            <span className="mr-auto inline-flex items-center gap-2 text-sm text-sub">
              <Spinner /> {status}
            </span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={!!status}>
            Отмена
          </Button>
          <Button variant="primary" onClick={download} disabled={!!status || total === 0}>
            Скачать
          </Button>
        </div>
      </div>
    </Modal>
  );
}
