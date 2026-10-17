import { addDays, diffDays, lastCompleteMetaDay } from "./dates";

export type PresetId = "7" | "30" | "90" | "month" | "prevmonth" | "custom";

export const PRESETS: { id: Exclude<PresetId, "custom">; label: string }[] = [
  { id: "7", label: "Последние 7 дней" },
  { id: "30", label: "Последние 30 дней" },
  { id: "90", label: "Последние 90 дней" },
  { id: "month", label: "Этот месяц" },
  { id: "prevmonth", label: "Прошлый месяц" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Период заканчивается последними завершёнными сутками Instagram
export function resolvePeriod(preset: string | null, from?: string | null, to?: string | null) {
  const last = lastCompleteMetaDay();
  const monthStart = (d: string) => d.slice(0, 8) + "01";
  switch (preset) {
    case "7":
      return { preset: "7" as PresetId, from: addDays(last, -6), to: last };
    case "90":
      return { preset: "90" as PresetId, from: addDays(last, -89), to: last };
    case "month":
      return { preset: "month" as PresetId, from: monthStart(last), to: last };
    case "prevmonth": {
      const end = addDays(monthStart(last), -1);
      return { preset: "prevmonth" as PresetId, from: monthStart(end), to: end };
    }
    case "custom":
      if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
        let f = from;
        let t = to > last ? last : to;
        if (f > t) [f, t] = [t, f];
        if (diffDays(f, t) > 365) f = addDays(t, -365);
        return { preset: "custom" as PresetId, from: f, to: t };
      }
      break;
  }
  return { preset: "30" as PresetId, from: addDays(last, -29), to: last };
}

export function periodDays(from: string, to: string) {
  return diffDays(from, to) + 1;
}
