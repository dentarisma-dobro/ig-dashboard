// Скачивание PDF-отчёта. Всё происходит в браузере: данные берутся из API сайта,
// документ собирается через @react-pdf/renderer (библиотека грузится только по нажатию кнопки).

import { createElement } from "react";
import type { ReportData } from "./report/data";

// Картинка -> JPEG data URL нужного размера (обрезка по центру).
// Через canvas, потому что PDF понимает только JPEG и PNG, а заодно файл получается легче.
function toJpeg(url: string, size: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 15000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

async function collectImages(data: ReportData): Promise<Record<string, string | null>> {
  const jobs: [string, string, number][] = [];
  for (const r of data.accounts) {
    if (r.account.avatar_url) jobs.push([`avatar:${r.account.id}`, r.account.avatar_url, 132]);
    const top = [...r.posts].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 10);
    for (const p of top) if (p.thumb_url) jobs.push([p.id, p.thumb_url, 96]);
  }
  const out: Record<string, string | null> = {};
  await Promise.all(jobs.map(async ([key, url, size]) => (out[key] = await toJpeg(url, size))));
  return out;
}

export function reportFileName(data: ReportData, ext: string) {
  const who = data.accounts.length === 1 ? data.accounts[0].account.username : "accounts";
  return `instagram-${who}-${data.from}_${data.to}.${ext}`;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function downloadPdfReport(data: ReportData) {
  const [{ pdf }, { ReportDocument, registerFonts }, images] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./report/pdf"),
    collectImages(data),
  ]);
  registerFonts(window.location.origin);
  const blob = await pdf(createElement(ReportDocument, { data, images }) as any).toBlob();
  saveBlob(blob, reportFileName(data, "pdf"));
}
