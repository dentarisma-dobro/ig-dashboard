// Даты в формате "YYYY-MM-DD" и сутки Instagram.
//
// Instagram считает дневную статистику по тихоокеанскому времени (America/Los_Angeles):
// сутки 16 октября длятся с 07:00 UTC 16.10 до 07:00 UTC 17.10 (зимой с 08:00).
// Окно запроса для одних суток: since = начало суток + 1 секунда, until = конец суток.
// Если передать since ровно на границе, Instagram добавит предыдущие сутки (проверено на API).

export const META_TZ = "America/Los_Angeles";
export const LOCAL_TZ = process.env.NEXT_PUBLIC_TZ || "Europe/Moscow";

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Сколько дней от a до b (b - a)
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function dateInTz(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

// Момент (в мс), когда в часовом поясе tz наступает полночь даты date
export function midnightUtc(date: string, tz: string): number {
  const guess = Date.parse(date + "T00:00:00Z");
  const off = tzOffsetMs(new Date(guess), tz);
  let t = guess - off;
  const off2 = tzOffsetMs(new Date(t), tz);
  if (off2 !== off) t = guess - off2;
  return t;
}

// Последние полностью завершённые сутки Instagram
export function lastCompleteMetaDay(now = new Date()): string {
  return addDays(dateInTz(now, META_TZ), -1);
}

// Окно запроса к Insights API для одних суток, в секундах
export function metaDayWindow(date: string): { since: number; until: number } {
  return {
    since: midnightUtc(date, META_TZ) / 1000 + 1,
    until: midnightUtc(addDays(date, 1), META_TZ) / 1000,
  };
}

// Список дат от from до to включительно
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
