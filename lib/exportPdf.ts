// Скачивание PDF-отчёта. Всё происходит в браузере: данные берутся из API сайта,
// документ собирается через @react-pdf/renderer (библиотека грузится только по нажатию кнопки).

import { createElement } from "react";
import type { ReportData } from "./report/data";

// Картинка -> JPEG data URL размером width × height (обрезка по центру).
// Через canvas, потому что PDF понимает только JPEG и PNG, а заодно файл получается легче.
function toJpeg(url: string, width: number, height = width): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 15000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        const scale = Math.min(img.naturalWidth / width, img.naturalHeight / height);
        const sw = width * scale;
        const sh = height * scale;
        ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, width, height);
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
  const jobs: [string, string, number, number?][] = [];
  for (const r of data.accounts) {
    if (r.account.avatar_url) jobs.push([`avatar:${r.account.id}`, r.account.avatar_url, 132]);
    const top = [...r.posts].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 10);
    for (const p of top) if (p.thumb_url) jobs.push([p.id, p.thumb_url, 96]);
  }
  for (const r of data.tg) if (r.channel.avatar_url) jobs.push([`tg:${r.channel.id}`, r.channel.avatar_url, 132]);
  for (const r of data.yt) {
    if (r.channel.avatar_url) jobs.push([`ytch:${r.channel.id}`, r.channel.avatar_url, 132]);
    const top = [...r.videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10);
    for (const v of top) if (v.thumb_url) jobs.push([`ytv:${v.id}`, v.thumb_url, 160, 90]);
  }
  const out: Record<string, string | null> = {};
  await Promise.all(jobs.map(async ([key, url, w, h]) => (out[key] = await toJpeg(url, w, h))));
  return out;
}

export function reportFileName(data: ReportData, ext: string) {
  const total = data.accounts.length + data.tg.length + data.yt.length;
  let who = "report";
  if (total === 1 && data.accounts.length === 1) who = `instagram-${data.accounts[0].account.username}`;
  if (total === 1 && data.tg.length === 1) who = `telegram-${data.tg[0].channel.username || data.tg[0].channel.id}`;
  if (total === 1 && data.yt.length === 1) who = `youtube-${data.yt[0].channel.handle || data.yt[0].channel.id}`;
  return `${who}-${data.from}_${data.to}.${ext}`;
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
