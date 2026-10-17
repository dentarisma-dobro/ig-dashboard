import { LOCAL_TZ } from "./dates";

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_FULL = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(n);
}

// 1 284 / 12,9 тыс. / 4,2 млн
export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${fmtNum(n / 1e6, 1)} млн`;
  if (abs >= 1e4) return `${fmtNum(n / 1e3, 1)} тыс.`;
  return fmtNum(n);
}

// Подписи осей: 0 / 500 / 1 тыс / 12 тыс
export function fmtAxis(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${fmtNum(n / 1e6, 1)} млн`;
  if (abs >= 1e3) return `${fmtNum(n / 1e3, 1)} тыс`;
  return fmtNum(n, 1);
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${fmtNum(n, digits)}%`;
}

export function fmtSigned(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "−"}${fmtNum(Math.abs(n), digits)}`;
}

export function pctChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

// "2026-10-16" -> "16 окт"
export function fmtDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

// "2026-10-16" -> "16 октября 2026"
export function fmtDayLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_FULL[m - 1]} ${y}`;
}

// "2026-10-16" -> "16.10.2026"
export function fmtDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

export function fmtRange(from: string, to: string): string {
  const [fy, fm] = from.split("-");
  const [ty, tm] = to.split("-");
  if (from === to) return fmtDayLong(from);
  if (fy === ty && fm === tm) return `${Number(from.slice(8))}–${fmtDayLong(to)}`;
  if (fy === ty) return `${fmtDay(from)} – ${fmtDayLong(to)}`;
  return `${fmtDayLong(from)} – ${fmtDayLong(to)}`;
}

// ISO-время публикации -> "16 окт, 14:03" по местному времени
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: LOCAL_TZ,
    day: "numeric",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")} ${MONTHS_SHORT[Number(get("month")) - 1]} ${get("year")}, ${get("hour")}:${get("minute")}`;
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return "никогда";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} ${plural(min, "минуту", "минуты", "минут")} назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${plural(h, "час", "часа", "часов")} назад`;
  const d = Math.round(h / 24);
  return `${d} ${plural(d, "день", "дня", "дней")} назад`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = ms / 1000;
  if (s < 60) return `${fmtNum(s, 1)} с`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин ${Math.round(s % 60)} с`;
  return `${fmtNum(s / 3600, 1)} ч`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
