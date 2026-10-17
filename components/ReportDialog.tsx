"use client";

import { useEffect, useState } from "react";
import type { Account } from "@/lib/types";
import { fmtRange } from "@/lib/format";
import { Avatar, Button, Modal, Spinner, cx } from "./ui";
import { IconFile, IconTable } from "./icons";

export function ReportDialog({
  open,
  onClose,
  accounts,
  defaultAccountId,
  from,
  to,
}: {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  defaultAccountId: string;
  from: string;
  to: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(defaultAccountId === "all" ? accounts.map((a) => a.id) : [defaultAccountId]);
      setError(null);
      setStatus(null);
    }
  }, [open, defaultAccountId, accounts]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function download() {
    setError(null);
    try {
      setStatus("Собираем данные…");
      const { loadReportData } = await import("@/lib/report/data");
      const list = accounts.filter((a) => selected.includes(a.id));
      const data = await loadReportData(list, from, to);
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

  return (
    <Modal open={open} onClose={status ? () => {} : onClose} title="Скачать отчёт">
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Период</p>
          <p className="text-sm text-sub">{fmtRange(from, to)}. Сменить можно в шапке страницы.</p>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Аккаунты</p>
          <div className="space-y-1.5">
            {accounts.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 hover:bg-page">
                <input type="checkbox" className="h-4 w-4 accent-[#2a78d6]" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                <Avatar account={a} size={24} />
                <span className="text-sm text-ink">{a.display_name}</span>
                <span className="text-xs text-muted">@{a.username}</span>
              </label>
            ))}
          </div>
          {selected.length > 1 && <p className="mt-1.5 text-xs text-muted">В PDF первой страницей будет сравнение аккаунтов.</p>}
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Формат</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "pdf" as const, icon: <IconFile />, title: "PDF", text: "Сводка, графики, лучшие публикации, Stories и аудитория" },
              { id: "xlsx" as const, icon: <IconTable />, title: "Excel", text: "Все цифры по дням, публикациям и Stories" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={cx(
                  "rounded-lg border px-3 py-2.5 text-left transition",
                  format === f.id ? "border-accent bg-accent-soft" : "border-line hover:bg-page"
                )}
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
          <Button variant="primary" onClick={download} disabled={!!status || selected.length === 0}>
            Скачать
          </Button>
        </div>
      </div>
    </Modal>
  );
}
